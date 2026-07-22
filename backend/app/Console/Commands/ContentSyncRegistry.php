<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Content\ContentRegistry;
use App\Models\SiteSetting;
use Illuminate\Console\Command;

/**
 * Reconcile DB rows with the content registry (adds missing shared rows; never deletes).
 */
class ContentSyncRegistry extends Command
{
    protected $signature = 'content:sync-registry {--dry-run : List missing keys without writing}';

    protected $description = 'Ensure every content registry block has a shared site_settings row';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $added = 0;

        foreach (ContentRegistry::blocks() as $key => $block) {
            $query = SiteSetting::query()->where('key', (string) $key);
            if (SiteSetting::hasScopeColumn()) {
                $query->where('scope', 'shared');
            }
            if ($query->exists()) {
                continue;
            }

            if ($dry) {
                $this->line("[dry-run] would add shared row for {$key}");
                $added++;

                continue;
            }

            SiteSetting::query()->create([
                'key' => (string) $key,
                'scope' => 'shared',
                'value' => is_array($block['default'] ?? null) || is_object($block['default'] ?? null)
                    ? json_encode($block['default'], JSON_UNESCAPED_UNICODE)
                    : (string) ($block['default'] ?? ''),
                'type' => (string) ($block['type'] ?? 'text'),
                'group' => (string) ($block['group'] ?? 'General'),
                'label' => (string) ($block['label'] ?? $key),
                'description' => null,
                'is_public' => (bool) ($block['public'] ?? false),
            ]);
            $added++;
        }

        $this->info($dry
            ? "Would add {$added} shared row(s)."
            : "Added {$added} shared row(s).");

        return self::SUCCESS;
    }
}
