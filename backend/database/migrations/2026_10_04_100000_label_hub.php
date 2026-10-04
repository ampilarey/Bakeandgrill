<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Label Hub (owner, 2026-10-04): "I want to print labels like this [the frozen
 * short-eat stickers and box labels] … accessible to all staff who have the
 * authority." See docs/LABEL_HUB_PLAN.md.
 *
 * What a pack sticker needs from an item, which inventory items count as
 * ingredients on it, and a log of every sheet printed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->boolean('label_enabled')->default(false);
            // auto: the recipe when the item has one, else the manual line.
            $table->string('label_ingredients_source', 8)->default('auto');
            $table->text('label_ingredients')->nullable();
            $table->text('label_ingredients_dv')->nullable();
            $table->unsignedSmallInteger('label_shelf_life_days')->nullable();
            $table->string('label_storage', 16)->default('frozen');
            $table->unsignedSmallInteger('label_pack_qty')->nullable();
            $table->foreignId('label_title_media_id')->nullable()->constrained('media_assets')->nullOnDelete();
            $table->foreignId('label_photo_media_id')->nullable()->constrained('media_assets')->nullOnDelete();
        });

        Schema::table('inventory_items', function (Blueprint $table): void {
            // Cling film, boxes and labels are in recipes for costing but are
            // not ingredients; the owner unticks them.
            $table->boolean('is_label_ingredient')->default(true);
            if (!Schema::hasColumn('inventory_items', 'name_dv')) {
                $table->string('name_dv', 255)->nullable();
            }
        });

        Schema::create('label_prints', function (Blueprint $table): void {
            $table->id();
            $table->string('kind', 24);
            $table->string('layout', 24);
            $table->decimal('label_w_mm', 6, 2)->nullable();
            $table->decimal('label_h_mm', 6, 2)->nullable();
            $table->foreignId('item_id')->nullable()->constrained('items')->nullOnDelete();
            $table->foreignId('kitchen_production_item_id')->nullable()->constrained('kitchen_production_items')->nullOnDelete();
            $table->foreignId('trade_delivery_id')->nullable()->constrained('trade_deliveries')->nullOnDelete();
            $table->unsignedInteger('copies')->default(0);
            $table->date('mfg_date')->nullable();
            $table->date('exp_date')->nullable();
            $table->string('batch_code', 40)->nullable();
            $table->unsignedSmallInteger('pack_qty')->nullable();
            $table->json('details')->nullable();
            $table->foreignId('printed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('output', 8)->default('print');
            $table->timestamp('created_at')->nullable();
            $table->index(['kind', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('label_prints');
        Schema::table('inventory_items', function (Blueprint $table): void {
            $table->dropColumn('is_label_ingredient');
        });
        Schema::table('items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('label_title_media_id');
            $table->dropConstrainedForeignId('label_photo_media_id');
            $table->dropColumn([
                'label_enabled', 'label_ingredients_source', 'label_ingredients', 'label_ingredients_dv',
                'label_shelf_life_days', 'label_storage', 'label_pack_qty',
            ]);
        });
    }
};
