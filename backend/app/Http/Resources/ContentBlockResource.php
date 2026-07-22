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
     * @param array{key: string, block: array<string, mixed>} $resource
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
        /** @var array{key: string, block: array<string, mixed>} $data */
        $data = $this->resource;
        $key = $data['key'];
        $block = $data['block'];

        $shared = SiteSetting::getScoped($key, 'shared');
        $website = SiteSetting::getScoped($key, 'website');
        $orderApp = SiteSetting::getScoped($key, 'order_app');

        $hasWebsite = $website !== null && $website !== '';
        $hasOrder = $orderApp !== null && $orderApp !== '';
        $state = ($hasWebsite || $hasOrder) ? 'split' : 'shared';

        return [
            'key' => $key,
            'label' => $block['label'] ?? $key,
            'group' => $block['group'] ?? 'General',
            'type' => $block['type'] ?? 'text',
            'apps' => $block['apps'] ?? [],
            'shareable' => (bool) ($block['shareable'] ?? false),
            'public' => (bool) ($block['public'] ?? false),
            'rich' => (bool) ($block['rich'] ?? false),
            'default' => $block['default'] ?? null,
            'shared' => $shared,
            'website' => $website,
            'order_app' => $orderApp,
            'resolved_website' => ContentResolver::for('website')->get($key),
            'resolved_order_app' => ContentResolver::for('order_app')->get($key),
            'state' => $state,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function collectionFromRegistry(): array
    {
        $out = [];
        foreach (ContentRegistry::blocks() as $key => $block) {
            $out[] = (new self(['key' => (string) $key, 'block' => $block]))->resolve();
        }

        return $out;
    }
}
