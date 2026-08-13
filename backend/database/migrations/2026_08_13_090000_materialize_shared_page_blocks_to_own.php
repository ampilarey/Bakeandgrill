<?php

declare(strict_types=1);

use App\Domains\Content\Blocks\PageBlockRepository;
use App\Models\PageBlock;
use App\Models\PageBlockSharedContent;
use App\Models\PageLayoutDraft;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage: finish page-block separation.
 *
 * Materialize every shared-mode page block's currently resolved settings into
 * that row's own settings JSON, then flip content_mode to own. Does not delete
 * page_block_shared_contents (rollback safety). Does not overwrite non-empty
 * local settings with another app's values — each row gets its own resolved
 * snapshot only.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('page_blocks')) {
            return;
        }

        $sharedById = [];
        if (Schema::hasTable('page_block_shared_contents')) {
            foreach (PageBlockSharedContent::query()->get() as $row) {
                $sharedById[(int) $row->id] = is_array($row->settings) ? $row->settings : [];
            }
        }

        PageBlock::query()
            ->where('content_mode', PageBlock::MODE_SHARED)
            ->orderBy('id')
            ->each(function (PageBlock $block) use ($sharedById): void {
                $local = is_array($block->settings) ? $block->settings : [];
                $sharedId = $block->shared_content_id !== null ? (int) $block->shared_content_id : null;
                $fromShared = ($sharedId !== null && isset($sharedById[$sharedId]))
                    ? $sharedById[$sharedId]
                    : [];

                // Prefer already-local settings (own overrides); else shared payload.
                $materialized = $local !== [] ? $local : $fromShared;

                $block->settings = $materialized;
                $block->content_mode = PageBlock::MODE_OWN;
                $block->shared_content_id = null;
                $block->save();
            });

        if (Schema::hasTable('page_layout_drafts')) {
            PageLayoutDraft::query()->orderBy('id')->each(function (PageLayoutDraft $draft): void {
                $payload = is_array($draft->payload) ? $draft->payload : [];
                $blocks = $payload['blocks'] ?? null;
                if (! is_array($blocks)) {
                    return;
                }
                $changed = false;
                foreach ($blocks as $i => $block) {
                    if (! is_array($block)) {
                        continue;
                    }
                    $mode = (string) ($block['content_mode'] ?? PageBlock::MODE_OWN);
                    if ($mode !== PageBlock::MODE_SHARED) {
                        continue;
                    }
                    $settings = is_array($block['settings'] ?? null) ? $block['settings'] : [];
                    if ($settings === [] && ! empty($block['shared_content_id'])) {
                        $shared = PageBlockSharedContent::query()->find((int) $block['shared_content_id']);
                        if ($shared instanceof PageBlockSharedContent && is_array($shared->settings)) {
                            $settings = $shared->settings;
                        }
                    }
                    $blocks[$i]['settings'] = $settings;
                    $blocks[$i]['content_mode'] = PageBlock::MODE_OWN;
                    $blocks[$i]['shared_content_id'] = null;
                    unset($blocks[$i]['shared_content_uuid'], $blocks[$i]['share_source'], $blocks[$i]['clear_app_overrides']);
                    $changed = true;
                }
                if ($changed) {
                    $payload['blocks'] = $blocks;
                    $draft->payload = $payload;
                    $draft->save();
                }
            });
        }

        if (Schema::hasColumn('page_blocks', 'content_mode')) {
            // New rows default to own.
            $driver = Schema::getConnection()->getDriverName();
            if (in_array($driver, ['mysql', 'mariadb'], true)) {
                DB::statement("ALTER TABLE page_blocks MODIFY content_mode VARCHAR(16) NOT NULL DEFAULT 'own'");
            } elseif ($driver === 'pgsql') {
                DB::statement("ALTER TABLE page_blocks ALTER COLUMN content_mode SET DEFAULT 'own'");
            }
            // SQLite keeps the column; application always writes own.
        }

        PageBlockRepository::bustAll();
    }

    public function down(): void
    {
        // Intentionally empty — shared mode is retired; restoring would re-couple apps.
    }
};
