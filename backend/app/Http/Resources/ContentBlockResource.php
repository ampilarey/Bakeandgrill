<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin array<string, mixed>
 */
class ContentBlockResource extends JsonResource
{
    /**
     * @param array{key: string, block: array<string, mixed>, locale?: string} $resource
     */
    public function __construct($resource)
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var array{key: string, block: array<string, mixed>, locale?: string} $data */
        $data = $this->resource;
        $key = $data['key'];
        $block = $data['block'];
        $locale = $data['locale'] ?? 'en';

        $shared = SiteSetting::getScoped($key, 'shared', $locale);
        $website = SiteSetting::getScoped($key, 'website', $locale);
        $orderApp = SiteSetting::getScoped($key, 'order_app', $locale);

        // Stage C: same/different removed — per-app scopes are always independent.
        $state = 'split';

        $description = $block['description'] ?? null;

        return [
            'key' => $key,
            'label' => $block['label'] ?? $key,
            'group' => $block['group'] ?? 'General',
            'type' => $block['type'] ?? 'text',
            'editor' => $block['editor'] ?? null,
            'locale' => $locale,
            'apps' => $block['apps'] ?? [],
            'shareable' => (bool) ($block['shareable'] ?? false),
            'public' => (bool) ($block['public'] ?? false),
            'rich' => (bool) ($block['rich'] ?? false),
            'deprecated' => (bool) ($block['deprecated'] ?? false),
            'section_enable' => (bool) ($block['section_enable'] ?? false),
            'brand_synced' => ContentRegistry::isSyncedAcrossApps($key),
            'description' => is_string($description) && $description !== '' ? $description : null,
            'default' => $block['default'] ?? null,
            'shared' => $shared,
            'website' => $website,
            'order_app' => $orderApp,
            'resolved_website' => ContentResolver::for('website', $locale)->get($key),
            'resolved_order_app' => ContentResolver::for('order_app', $locale)->get($key),
            'state' => $state,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function collectionFromRegistry(string $locale = 'en'): array
    {
        $out = [];
        foreach (ContentRegistry::hubBlocks() as $key => $block) {
            $out[] = (new self([
                'key' => (string) $key,
                'block' => $block,
                'locale' => $locale,
            ]))->resolve();
        }

        return $out;
    }
}
