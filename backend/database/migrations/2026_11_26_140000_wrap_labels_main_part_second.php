<?php

declare(strict_types=1);

use App\Domains\Labels\WrapConfig;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-11-26: "move the main page which is on the left side to 2nd in
 * all the templates and labels so main part will not have joint". A saved
 * wrap-around label whose brand part leads has its last part brought round to
 * the front, so the main part is second and the label's joint is not at its edge.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['custom_labels', 'items'] as $table) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'label_wrap')) {
                continue;
            }
            foreach (DB::table($table)->whereNotNull('label_wrap')->get(['id', 'label_wrap']) as $row) {
                $wrap = is_string($row->label_wrap) ? json_decode($row->label_wrap, true) : null;
                if (!is_array($wrap) || !is_array($wrap['parts'] ?? null)) {
                    continue;
                }
                $moved = WrapConfig::mainSecond($wrap['parts']);
                if ($moved !== array_values($wrap['parts'])) {
                    $wrap['parts'] = $moved;
                    DB::table($table)->where('id', $row->id)->update(['label_wrap' => json_encode($wrap, JSON_UNESCAPED_UNICODE)]);
                }
            }
        }
        // Saved templates keep their parts inside `fields`.
        if (Schema::hasTable('label_templates') && Schema::hasColumn('label_templates', 'fields')) {
            foreach (DB::table('label_templates')->get(['id', 'fields']) as $row) {
                $fields = is_string($row->fields) ? json_decode($row->fields, true) : null;
                if (!is_array($fields) || !is_array($fields['label_wrap']['parts'] ?? null)) {
                    continue;
                }
                $moved = WrapConfig::mainSecond($fields['label_wrap']['parts']);
                if ($moved !== array_values($fields['label_wrap']['parts'])) {
                    $fields['label_wrap']['parts'] = $moved;
                    DB::table('label_templates')->where('id', $row->id)->update(['fields' => json_encode($fields, JSON_UNESCAPED_UNICODE)]);
                }
            }
        }
    }

    public function down(): void
    {
        // Nothing to undo: which labels were changed is not kept.
    }
};
