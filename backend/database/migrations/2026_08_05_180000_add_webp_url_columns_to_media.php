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
            $table->string('image_webp_url', 500)->nullable()->after('thumb_url');
            $table->string('thumb_webp_url', 500)->nullable()->after('image_webp_url');
        });

        Schema::table('item_photos', function (Blueprint $table): void {
            $table->string('image_webp_url', 500)->nullable()->after('thumb_url');
            $table->string('thumb_webp_url', 500)->nullable()->after('image_webp_url');
        });

        Schema::table('categories', function (Blueprint $table): void {
            $table->string('image_webp_url', 500)->nullable()->after('thumb_url');
            $table->string('thumb_webp_url', 500)->nullable()->after('image_webp_url');
        });

        if (Schema::hasTable('media_assets')) {
            Schema::table('media_assets', function (Blueprint $table): void {
                $table->string('image_webp_url', 500)->nullable()->after('thumb_url');
                $table->string('thumb_webp_url', 500)->nullable()->after('image_webp_url');
            });
        }
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->dropColumn(['image_webp_url', 'thumb_webp_url']);
        });

        Schema::table('item_photos', function (Blueprint $table): void {
            $table->dropColumn(['image_webp_url', 'thumb_webp_url']);
        });

        Schema::table('categories', function (Blueprint $table): void {
            $table->dropColumn(['image_webp_url', 'thumb_webp_url']);
        });

        if (Schema::hasTable('media_assets') && Schema::hasColumn('media_assets', 'image_webp_url')) {
            Schema::table('media_assets', function (Blueprint $table): void {
                $table->dropColumn(['image_webp_url', 'thumb_webp_url']);
            });
        }
    }
};
