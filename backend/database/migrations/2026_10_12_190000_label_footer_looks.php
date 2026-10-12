<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Owner, 2026-10-12: footers "in different styles". A footer preset picks
 * its look: dark (the band as before), light, rust, plain (no band, a rule)
 * or logo (the whole logo in the band). StickerDesign::footerPalette().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('label_footers', function (Blueprint $table) {
            $table->string('style', 12)->default('dark')->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('label_footers', function (Blueprint $table) {
            $table->dropColumn('style');
        });
    }
};
