<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Did the suggestion earn its screen space?
 *
 * The pair stats say what customers buy together; they say nothing about
 * whether the "Goes well with" panel changed anyone's mind. Without that the
 * upsell block cannot be evaluated, only admired. This records the two numbers
 * that settle it — how often a suggestion was shown, and how often it was
 * taken — so the admin report can put money against the feature itself.
 *
 * Rolled up per day / surface / item rather than stored per event: a busy
 * service would write thousands of "shown" rows a day for a report that only
 * ever reads them summed, and the daily grain is enough to trend.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_suggestion_stats', function (Blueprint $table): void {
            $table->id();
            $table->date('stat_date');
            // Where it was drawn: cart drawer, item sheet, or the till.
            $table->string('surface', 24);
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();

            $table->unsignedInteger('shown_count')->default(0);
            $table->unsignedInteger('accepted_count')->default(0);
            // Menu price at the moment of acceptance — the pair stats are
            // recomputed nightly and prices move, so this cannot be derived later.
            $table->decimal('accepted_revenue', 12, 2)->default(0);

            $table->timestamps();

            $table->unique(['stat_date', 'surface', 'item_id'], 'item_suggestion_stats_day_surface_item_uniq');
            $table->index(['stat_date'], 'item_suggestion_stats_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_suggestion_stats');
    }
};
