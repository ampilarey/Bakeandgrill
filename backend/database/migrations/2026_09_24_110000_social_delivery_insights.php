<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Social Hub audit (2026-09-24): engagement numbers for a published
 * delivery — likes, comments, shares as the platform reports them (only
 * Facebook and Instagram offer any) — and when they were last fetched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_post_deliveries', function (Blueprint $table) {
            $table->json('insights')->nullable()->after('published_at');
            $table->timestamp('insights_at')->nullable()->after('insights');
        });
    }

    public function down(): void
    {
        Schema::table('social_post_deliveries', function (Blueprint $table) {
            $table->dropColumn(['insights', 'insights_at']);
        });
    }
};
