<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Custom labels (owner, 2026-10-11: "Add option to add custom labels using
 * different brands logos and other details. Not only from the menu list").
 *
 * A product that is not on the menu, printed on the same pack stickers: its
 * own name, brand (with its logo), label type and wording. The wording
 * columns carry the same names as the items' label columns, so a custom label
 * resolves its wording exactly as an item does (LabelTypes::forItem): its own
 * box, else the type's, else the defaults for its storage.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('custom_labels', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);
            $table->string('name_dv', 80)->nullable();
            // Its own brand wins over the type's (null: the type's brand, else the main brand).
            $table->foreignId('brand_id')->nullable()->constrained('label_brands')->nullOnDelete();
            $table->foreignId('label_type_id')->nullable()->constrained('label_types')->nullOnDelete();
            // Null: the type's storage, else frozen.
            $table->string('label_storage', 16)->nullable();
            $table->string('label_heading', 40)->nullable();
            $table->string('label_heading_dv', 40)->nullable();
            $table->string('label_storage_line', 160)->nullable();
            $table->string('label_storage_line_dv', 160)->nullable();
            $table->text('label_ingredients')->nullable();
            $table->text('label_ingredients_dv')->nullable();
            $table->string('label_how_to_use', 200)->nullable();
            $table->string('label_how_to_use_dv', 200)->nullable();
            $table->string('label_note', 120)->nullable();
            $table->string('label_note_dv', 120)->nullable();
            $table->unsignedSmallInteger('label_shelf_life_days')->nullable();
            $table->unsignedSmallInteger('label_pack_qty')->nullable();
            $table->string('label_pack_unit', 10)->nullable();
            $table->foreignId('label_photo_media_id')->nullable()->constrained('media_assets')->nullOnDelete();
            $table->foreignId('label_title_media_id')->nullable()->constrained('media_assets')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('label_prints', function (Blueprint $table) {
            $table->foreignId('custom_label_id')->nullable()->after('item_id')->constrained('custom_labels')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('label_prints', function (Blueprint $table) {
            $table->dropConstrainedForeignId('custom_label_id');
        });
        Schema::dropIfExists('custom_labels');
    }
};
