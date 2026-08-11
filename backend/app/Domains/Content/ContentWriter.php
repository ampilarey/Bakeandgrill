<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Models\ContentRevision;
use App\Models\SiteSetting;
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
                'user_id' => $request?->user() instanceof \App\Models\User
                    ? $request->user()->id
                    : null,
                'created_at' => now(),
            ]);
        }

        SiteSetting::set($key, $value, $scope, $locale);

        // Brand keys (logo, favicon, default item photo, …) must stay identical
        // across website + order app. Hub may write one scope — mirror the rest.
        if (ContentRegistry::isSyncedAcrossApps($key)) {
            foreach (ContentRegistry::SCOPES as $mirrorScope) {
                if ($mirrorScope === $scope) {
                    continue;
                }
                SiteSetting::set($key, $value, $mirrorScope, $locale);
            }
        }

        // Publishing to "shared" while website/order_app overrides linger makes the
        // new value invisible on the public site (resolver prefers app scope).
        // Clear those overrides so "Same in both" edits actually show — same as
        // ContentController::share(), but applied on every shared write.
        if ($scope === 'shared' && ContentRegistry::isShareable($key) && ! ContentRegistry::isSyncedAcrossApps($key)) {
            $this->clearAppOverrides($key, $locale);
        }

        // hero_slides is the sole source of truth — blank legacy slots so an
        // empty array cannot resurrect old hero_slide_1/2/3 on the public site.
        if ($key === 'hero_slides') {
            $this->clearLegacyHeroSlides($scope, $locale);
        }

        // Promote / clear any autosaved draft for this key.
        ContentRevision::query()
            ->where('key', $key)
            ->where('scope', $scope)
            ->where('locale', $locale)
            ->where('is_draft', true)
            ->delete();

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
        $scopes = array_values(array_unique([$scope, 'shared', 'website', 'order_app']));
        foreach ($scopes as $clearScope) {
            foreach (['hero_slide_1', 'hero_slide_2', 'hero_slide_3'] as $legacyKey) {
                SiteSetting::set($legacyKey, '{}', $clearScope, $locale);
            }
        }
    }

    private function clearAppOverrides(string $key, string $locale): void
    {
        foreach (ContentRegistry::APPS as $appScope) {
            // clearScoped forgets the forever cache — bare delete left stale
            // getScoped() values that blocked Content Hub "Different per app".
            SiteSetting::clearScoped($key, $appScope, $locale);
        }
    }
}
