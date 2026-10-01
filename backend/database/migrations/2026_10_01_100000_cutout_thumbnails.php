<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-10-01, with two screenshots of the ZUS Coffee app: "there is a
 * v light color circle or oval background. And the item is placed above the
 * background and the item photo is without the background ... Can u add this
 * for the thumbnail pic only ... I add png without background of the item."
 *
 * A second picture per item: a cut-out with a see-through background, shown
 * on the small cards (website menu, order app menu, POS tiles) over a circle
 * the app draws. The circle's colour and strength come from a backdrop that
 * can be set for the whole menu, a category, a subcategory, or one item.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->string('cutout_url', 2048)->nullable()->after('thumb_webp_url');
            $table->string('cutout_webp_url', 2048)->nullable()->after('cutout_url');
            $table->json('cutout_backdrop')->nullable()->after('cutout_webp_url');
        });

        Schema::table('categories', function (Blueprint $table): void {
            $table->json('cutout_backdrop')->nullable()->after('thumb_webp_url');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->dropColumn(['cutout_url', 'cutout_webp_url', 'cutout_backdrop']);
        });
        Schema::table('categories', function (Blueprint $table): void {
            $table->dropColumn('cutout_backdrop');
        });
    }
};
