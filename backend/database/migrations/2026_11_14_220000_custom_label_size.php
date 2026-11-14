<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The size a custom label is made at (owner, 2026-11-14: "When in my label
 * edit is clicked, its not opening the saved label exactly like size and
 * everything"): the shape, the one-tap size or the typed one, and what it
 * prints on (`label_size`, JSON; StickerLayouts::cleanSize). Until now the
 * size lived in the browser, so Edit opened at whatever printed last.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('custom_labels', 'label_size')) {
            Schema::table('custom_labels', function (Blueprint $table) {
                $table->json('label_size')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('custom_labels', 'label_size')) {
            Schema::table('custom_labels', function (Blueprint $table) {
                $table->dropColumn('label_size');
            });
        }
    }
};
