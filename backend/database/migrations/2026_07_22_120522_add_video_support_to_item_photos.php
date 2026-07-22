<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('item_photos', function (Blueprint $table): void {
            $table->string('media_type', 8)->default('image')->after('is_primary');
            $table->string('poster_url', 500)->nullable()->after('media_type');
            $table->index('media_type');
        });
    }

    public function down(): void
    {
        Schema::table('item_photos', function (Blueprint $table): void {
            $table->dropIndex(['media_type']);
            $table->dropColumn(['media_type', 'poster_url']);
        });
    }
};
