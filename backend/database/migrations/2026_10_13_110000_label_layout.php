<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The drag designer (round 8 of the usability work, owner, 2026-10-13: "a
 * drag-and-drop designer on the sticker: move and resize text and pictures,
 * with Back to automatic"). A product keeps, per design, the parts moved or
 * resized by hand (`label_layout`, JSON; App\Domains\Labels\LabelLayout);
 * nothing kept means the design places everything itself.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->json('label_layout')->nullable()->after('label_nutrition_per');
        });
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->json('label_layout')->nullable()->after('label_nutrition_per');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('label_layout');
        });
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->dropColumn('label_layout');
        });
    }
};
