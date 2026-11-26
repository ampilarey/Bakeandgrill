<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-11-26 ("Why keep frozen by default?"): a custom label with no
 * type and no storage picked now prints no storage line. The labels made
 * before that printed the frozen line, so they keep it: their storage is
 * written down as frozen, which is what they print today.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('custom_labels') || !Schema::hasColumn('custom_labels', 'label_storage')) {
            return;
        }
        DB::table('custom_labels')
            ->whereNull('label_type_id')
            ->where(fn ($q) => $q->whereNull('label_storage')->orWhere('label_storage', ''))
            ->update(['label_storage' => 'frozen']);
    }

    public function down(): void
    {
        // Nothing to undo: which labels had no storage picked is not kept.
    }
};
