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
        if (ContentRegistry::isRich($key) || ContentRegistry::type($key) === 'textarea') {
            $value = ContentSanitizer::clean($value);
        }

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

        // Brand fallback photo is used by both website Blade and the order app.
        // Content Studio editors publish to app scopes — mirror to shared so
        // SiteSetting::get / order_app public settings stay in sync.
        if ($scope !== 'shared' && $key === 'default_item_image') {
            SiteSetting::set($key, $value, 'shared', $locale);
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
}
