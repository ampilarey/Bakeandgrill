<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A brand you buy, whether or not anybody has photographed it yet.
 *
 * Owner, 2026-09-09: "i want to save more than one brand, and photo is
 * optional." The table was built as a picture that happened to carry a brand
 * name, so a brand could not be written down until somebody was standing in
 * front of the tin with a camera. It is the other way round: the brand is the
 * fact, and the picture is the useful extra.
 *
 * That does make this a register of brands per item, which the original note
 * deliberately avoided. The owner asked for it. What makes it worth having is
 * that a brand recorded here reaches the buying screens straight away, instead
 * of only appearing after the first purchase line that mentions it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_brand_photos', function (Blueprint $table) {
            $table->string('file_path')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Rows with no picture cannot survive a NOT NULL column, and an empty
        // string would be a path to nothing. They are dropped rather than
        // faked, which is what rolling this back means.
        DB::table('inventory_brand_photos')->whereNull('file_path')->delete();

        Schema::table('inventory_brand_photos', function (Blueprint $table) {
            $table->string('file_path')->nullable(false)->change();
        });
    }
};
