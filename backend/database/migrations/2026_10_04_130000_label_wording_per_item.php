<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Owner, 2026-10-04: "i created a label but it says frozen hedhika even
 * though its not a frozen hedhika, can u make more customisation". The
 * sticker heading was one setting for every product. Now each item can
 * carry its own heading, storage line, a note under the ingredients and
 * the unit after the quantity; empty means the default for its storage.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('label_heading', 40)->nullable()->after('label_pack_qty');
            $table->string('label_heading_dv', 40)->nullable()->after('label_heading');
            $table->string('label_storage_line', 160)->nullable()->after('label_heading_dv');
            $table->string('label_storage_line_dv', 160)->nullable()->after('label_storage_line');
            $table->string('label_note', 120)->nullable()->after('label_storage_line_dv');
            $table->string('label_note_dv', 120)->nullable()->after('label_note');
            $table->string('label_pack_unit', 10)->nullable()->after('label_note_dv');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['label_heading', 'label_heading_dv', 'label_storage_line', 'label_storage_line_dv', 'label_note', 'label_note_dv', 'label_pack_unit']);
        });
    }
};
