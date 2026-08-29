<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Self-hosted, privacy-friendly visitor counting: one row per day × surface
 * (web = Blade site, order = order app). Only aggregates are stored — the
 * per-visitor uniqueness check lives in the cache as a salted hash with a
 * 2-day TTL, so no IPs, cookies or identifiers ever touch the database.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_visits_daily', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->string('surface', 16); // web | order
            $table->unsignedBigInteger('views')->default(0);
            $table->unsignedBigInteger('uniques')->default(0);
            $table->timestamps();

            $table->unique(['date', 'surface']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_visits_daily');
    }
};
