<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Keep a high-res master for re-crop / reuse, while image_url / url stay the
 * public 1200×900 crop used by POS and the website.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->string('image_original_url', 500)->nullable()->after('image_url');
        });

        Schema::table('item_photos', function (Blueprint $table): void {
            $table->string('original_url', 500)->nullable()->after('url');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->dropColumn('image_original_url');
        });

        Schema::table('item_photos', function (Blueprint $table): void {
            $table->dropColumn('original_url');
        });
    }
};
