<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->string('thumb_url', 500)->nullable()->after('image_original_url');
        });

        Schema::table('item_photos', function (Blueprint $table): void {
            $table->string('thumb_url', 500)->nullable()->after('original_url');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->dropColumn('thumb_url');
        });

        Schema::table('item_photos', function (Blueprint $table): void {
            $table->dropColumn('thumb_url');
        });
    }
};
