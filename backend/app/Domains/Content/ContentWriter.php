<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Models\ContentDraft;
use App\Models\ContentRevision;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\AuditLogService;
use App\Support\ContentSanitizer;
use Illuminate\Http\Request;

/**
 * Single write path for content values — snapshots revisions, sanitises, audits.
 */
final class ContentWriter
{
    public function __construct(
        private readonly AuditLogService $audit,
        private readonly ContentValidationService $validator,
    ) {}

    public function write(
        string $key,
        string $scope,
        string $value,
        string $locale = 'en',
        ?Request $request = null,
        string $auditAction = 'content.updated',
        array $extraMeta = [],
    ): void {
        $value = $this->validator->normalizeForWrite($key, $scope, $value);
        $value = self::prepareValue($key, $value);

        $old = SiteSetting::getScoped($key, $scope, $locale);

        if ($old !== null && (string) $old !== $value) {
            ContentRevision::query()->create([
                'key' => $key,
                'scope' => $scope,
                'locale' => $locale,
                'value' => $old,
                'is_draft' => false,
                'published_at' => now(),
                'user_id' => $request?->user() instanceof User
                    ? $request->user()->id
                    : null,
                'created_at' => now(),
            ]);
        }

        SiteSetting::set($key, $value, $scope, $locale);

        // hero_slides is the sole source of truth — blank legacy slots so an
        // empty array cannot resurrect old hero_slide_1/2/3 on the public site.
        if ($key === 'hero_slides') {
            $this->clearLegacyHeroSlides($scope, $locale);
        }

        // Promote / clear any autosaved draft for this key.
        $userId = $request?->user() instanceof User ? $request->user()->id : null;
        if ($userId !== null) {
            ContentDraft::query()
                ->where('user_id', $userId)
                ->where('key', $key)
                ->where('scope', $scope)
                ->where('locale', $locale)
                ->delete();
        }

        if ($userId !== null) {
            ContentRevision::query()
                ->where('user_id', $userId)
                ->where('key', $key)
                ->where('scope', $scope)
                ->where('locale', $locale)
                ->where('is_draft', true)
                ->delete();
        }

        $this->audit->log(
            action: $auditAction,
            modelType: SiteSetting::class,
            modelId: null,
            oldValues: ['value' => $old],
            newValues: ['value' => $value],
            meta: array_merge(['setting_key' => $key, 'scope' => $scope, 'locale' => $locale], $extraMeta),
            request: $request,
        );
    }

    /**
     * Prepare a content value for draft or publish (shared sanitisation rules).
     */
    public static function prepareValue(string $key, string $value): string
    {
        // Never run HTML strip_tags over a JSON document — it corrupts escaped
        // tags (e.g. <\/em>) and can blank nested fields. Sanitize string fields inside.
        if (ContentRegistry::type($key) === 'json') {
            return self::sanitizeJsonRichFields($key, $value);
        }

        if (ContentRegistry::isRich($key) || ContentRegistry::type($key) === 'textarea') {
            return ContentSanitizer::clean($value);
        }

        return $value;
    }

    private static function sanitizeJsonRichFields(string $key, string $value): string
    {
        if ($value === '' || ! ContentRegistry::isRich($key)) {
            return $value;
        }

        $decoded = json_decode($value, true);
        if (! is_array($decoded)) {
            return $value;
        }

        if ($key === 'hero_slides' && array_is_list($decoded)) {
            foreach ($decoded as $i => $slide) {
                if (! is_array($slide)) {
                    continue;
                }
                foreach (['eyebrow', 'title', 'subtitle', 'cta_text', 'cta2_text', 'image_alt'] as $field) {
                    if (isset($slide[$field]) && is_string($slide[$field])) {
                        $decoded[$i][$field] = ContentSanitizer::clean($slide[$field]);
                    }
                }
            }

            return json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: $value;
        }

        return $value;
    }

    private function clearLegacyHeroSlides(string $scope, string $locale): void
    {
        // Only the scope being edited — never wipe the other app or business record.
        foreach (['hero_slide_1', 'hero_slide_2', 'hero_slide_3'] as $legacyKey) {
            SiteSetting::set($legacyKey, '{}', $scope, $locale);
        }
    }

}
