<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Wrap-around labels (owner, 2026-10-12: a bottle label "with 2, 3, 4, 5
 * different parts"): which parts a product's wide label prints and in what
 * order, its flavour band, recycling marks, pictures and free text
 * (`label_wrap`, JSON; App\Domains\Labels\WrapConfig), and whether its
 * nutrition values are per 100 g or per 100 ml (`label_nutrition_per`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->json('label_wrap')->nullable()->after('label_show_nutrition');
            $table->string('label_nutrition_per', 2)->default('g')->after('label_wrap');
        });
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->json('label_wrap')->nullable()->after('label_nutrition');
            $table->string('label_nutrition_per', 2)->default('g')->after('label_wrap');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['label_wrap', 'label_nutrition_per']);
        });
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->dropColumn(['label_wrap', 'label_nutrition_per']);
        });
    }
};
