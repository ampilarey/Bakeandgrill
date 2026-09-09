<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A picture of what a brand looks like on the shelf.
 *
 * Owner, 2026-09-09: "can i upload a pic of different brand of item to know
 * which brand is this". Brand is free text on a purchase line and always has
 * been — a register of brands would be one more list to maintain. This does
 * not change that. It hangs an optional photo off the pair that already
 * exists in the data, the item and the brand somebody typed, so whoever is
 * standing in the shop can see which tin to pick up.
 *
 * `brand_key` is the brand folded to lower case with its spaces collapsed.
 * "Sunrise", "sunrise" and " Sunrise " are one brand to a person, so they
 * are one row here, while `brand` keeps the spelling that was typed for
 * display.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_brand_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained('inventory_items')->cascadeOnDelete();
            $table->string('brand', 120);
            $table->string('brand_key', 120);
            $table->string('file_path');
            $table->string('original_filename')->nullable();
            $table->string('mime_type', 128)->nullable();
            $table->unsignedInteger('size')->nullable();
            $table->string('note', 160)->nullable();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // One picture per brand of an item. Replacing it overwrites the row.
            $table->unique(['inventory_item_id', 'brand_key'], 'ibp_item_brand_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_brand_photos');
    }
};
