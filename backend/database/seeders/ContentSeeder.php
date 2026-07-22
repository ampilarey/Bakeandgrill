<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domains\Content\ContentRegistry;
use App\Models\SiteSetting;
use Illuminate\Database\Seeder;

/**
 * Idempotent: ensure every registry block has a shared row.
 * Never overwrites an existing non-empty value.
 */
class ContentSeeder extends Seeder
{
    public function run(): void
    {
        foreach (ContentRegistry::blocks() as $key => $block) {
            $query = SiteSetting::query()->where('key', (string) $key);
            if (SiteSetting::hasScopeColumn()) {
                $query->where('scope', 'shared');
            }

            $existing = $query->first();
            if ($existing && $existing->value !== null && $existing->value !== '') {
                continue;
            }

            $value = is_array($block['default'] ?? null) || is_object($block['default'] ?? null)
                ? json_encode($block['default'], JSON_UNESCAPED_UNICODE)
                : (string) ($block['default'] ?? '');

            if ($existing) {
                if ($existing->value === null || $existing->value === '') {
                    $existing->value = $value;
                    $existing->save();
                }

                continue;
            }

            $payload = [
                'key' => (string) $key,
                'value' => $value,
                'type' => (string) ($block['type'] ?? 'text'),
                'group' => (string) ($block['group'] ?? 'General'),
                'label' => (string) ($block['label'] ?? $key),
                'description' => null,
                'is_public' => (bool) ($block['public'] ?? false),
            ];
            if (SiteSetting::hasScopeColumn()) {
                $payload['scope'] = 'shared';
            }

            SiteSetting::query()->create($payload);
        }
    }
}
