<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per page view (owner, 2026-10-24: "Add maximum detail u can get"):
 * the page, where the visitor came from, their device, browser, system,
 * country, language and screen, how long they stayed, and whether the visit
 * started or ended there. No IP address and no cookie: `visitor` is a salted
 * hash that changes every day, `session` a random tag the browser keeps for
 * the tab. Raw rows are pruned after 180 days (`visits:prune`); the daily
 * totals in site_visits_daily stay.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_visit_events', function (Blueprint $table) {
            $table->id();
            $table->timestamp('occurred_at');
            // Business-day fields, worked out at insert so every database groups them alike.
            $table->date('day');
            $table->unsignedTinyInteger('hour');
            $table->unsignedTinyInteger('dow'); // 0 = Sunday
            $table->string('surface', 8); // web | order
            $table->string('visitor', 16);
            $table->string('session', 32);
            $table->string('view_key', 32)->nullable();
            $table->string('path', 255);
            $table->string('referrer_host', 120)->nullable();
            $table->string('utm_source', 60)->nullable();
            $table->string('utm_medium', 60)->nullable();
            $table->string('utm_campaign', 80)->nullable();
            $table->string('device', 8); // mobile | tablet | desktop
            $table->string('browser', 24);
            $table->string('os', 16);
            $table->char('country', 2)->nullable();
            $table->string('lang', 8)->nullable();
            $table->unsignedSmallInteger('screen_w')->nullable();
            $table->boolean('returning')->default(false);
            $table->boolean('is_entry')->default(false);
            $table->unsignedInteger('duration_s')->nullable();

            $table->index(['day', 'surface']);
            $table->index('occurred_at');
            $table->index('session');
            $table->index('view_key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_visit_events');
    }
};
