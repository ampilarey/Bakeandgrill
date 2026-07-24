<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Central Media Library: catalog, collections, versions, permissions.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('media_assets')) {
            Schema::create('media_assets', function (Blueprint $table) {
                $table->id();
                $table->string('disk', 32)->default('public');
                $table->string('path', 500);
                $table->string('media_type', 16); // image|video|audio|document
                $table->string('mime_type', 100);
                $table->unsignedBigInteger('file_size')->default(0);
                $table->unsignedInteger('width')->nullable();
                $table->unsignedInteger('height')->nullable();
                $table->unsignedInteger('duration_seconds')->nullable();
                $table->string('thumb_url', 500)->nullable();
                $table->string('original_url', 500)->nullable();
                $table->string('title', 200)->nullable();
                $table->string('alt_text', 300)->nullable();
                $table->json('tags')->nullable();
                $table->string('source', 32)->default('other');
                $table->string('checksum', 64)->nullable();
                $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->unique('path');
                $table->index('media_type');
                $table->index('source');
                $table->index('checksum');
            });
        }

        if (!Schema::hasTable('media_collections')) {
            Schema::create('media_collections', function (Blueprint $table) {
                $table->id();
                $table->string('name')->unique();
                $table->string('slug')->unique();
                $table->string('description')->nullable();
                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('media_asset_collection')) {
            Schema::create('media_asset_collection', function (Blueprint $table) {
                $table->id();
                $table->foreignId('media_asset_id')->constrained('media_assets')->cascadeOnDelete();
                $table->foreignId('media_collection_id')->constrained('media_collections')->cascadeOnDelete();
                $table->unique(['media_asset_id', 'media_collection_id'], 'media_asset_collection_unique');
            });
        }

        if (!Schema::hasTable('media_asset_versions')) {
            Schema::create('media_asset_versions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('media_asset_id')->constrained('media_assets')->cascadeOnDelete();
                $table->string('path', 500);
                $table->string('mime_type', 100)->nullable();
                $table->unsignedBigInteger('file_size')->nullable();
                $table->unsignedInteger('width')->nullable();
                $table->unsignedInteger('height')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        $now = now();
        $starters = [
            ['name' => 'Banners', 'description' => 'Promo and category banners'],
            ['name' => 'Logos', 'description' => 'Brand logos and marks'],
            ['name' => 'Menu Items', 'description' => 'Menu item photos'],
            ['name' => 'Drinks', 'description' => 'Drink photography'],
            ['name' => 'Backgrounds', 'description' => 'Backgrounds and hero imagery'],
            ['name' => 'Documents', 'description' => 'PDFs and documents'],
        ];
        foreach ($starters as $i => $row) {
            DB::table('media_collections')->updateOrInsert(
                ['slug' => Str::slug($row['name'])],
                [
                    'name' => $row['name'],
                    'description' => $row['description'],
                    'sort_order' => ($i + 1) * 10,
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
            );
        }

        foreach (['owner', 'manager', 'staff'] as $slug) {
            Role::firstOrCreate(
                ['slug' => $slug],
                ['name' => ucfirst($slug), 'description' => '', 'is_active' => true],
            );
        }

        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        Schema::dropIfExists('media_asset_versions');
        Schema::dropIfExists('media_asset_collection');
        Schema::dropIfExists('media_collections');
        Schema::dropIfExists('media_assets');
    }
};
