<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Production plan — owner, 2026-09-08: "for Friday evening we will need to
 * make 50 bajiya", with the reminders that the start, middle and end of the
 * month sell differently, that school and office holidays move sales, and
 * asking what registered customers' habits can tell us.
 *
 * Three tables:
 *
 *   production_calendar_periods — the days that are not ordinary days:
 *     public holidays, school holidays, office holidays, Ramadan, Eid, a
 *     closure, an event. The planner learns each kind's effect from the
 *     sales on those days, and until it has seen enough of them it uses
 *     the expectation the owner typed on the period ("−40%").
 *
 *   production_plan_items — per menu item (or size): the service level to
 *     plan for, batch rounding, a floor, and whether it is planned at all.
 *
 *   production_plan_records — what the plan said and what was then decided,
 *     per item and time slot, so the plan can be marked against what sold.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('production_calendar_periods', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 32);
            $table->string('label')->nullable();
            $table->date('starts_on');
            $table->date('ends_on');
            // The owner's own expectation of the effect, in percent, used
            // while there is too little history to learn it: −40 for an
            // office holiday that empties the town, +30 for Eid.
            $table->smallInteger('expected_change_pct')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['starts_on', 'ends_on'], 'pcp_range_idx');
            $table->index('kind', 'pcp_kind_idx');
        });

        Schema::create('production_plan_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            // 0 means the item itself; a size is planned as its own line.
            $table->unsignedBigInteger('variant_id')->default(0);
            $table->boolean('enabled')->default(true);
            // "Make enough for this share of such days": 85 means the plan
            // covers demand on 85 of every 100 comparable days.
            $table->unsignedTinyInteger('service_level_pct')->default(85);
            // Plan in multiples of this (a tray of 10 bajiya).
            $table->unsignedSmallInteger('round_to')->default(1);
            // Never plan fewer than this for the day.
            $table->unsignedSmallInteger('min_qty')->default(0);
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->unique(['item_id', 'variant_id'], 'ppi_item_variant_unique');
        });

        Schema::create('production_plan_records', function (Blueprint $table) {
            $table->id();
            $table->date('plan_date');
            $table->unsignedTinyInteger('slot_start');
            $table->unsignedTinyInteger('slot_end');
            $table->string('slot_label', 40)->nullable();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->unsignedBigInteger('variant_id')->default(0);
            $table->decimal('forecast_qty', 10, 2)->default(0);
            $table->decimal('planned_qty', 10, 2)->default(0);
            $table->decimal('actual_qty', 10, 2)->nullable();
            $table->boolean('sold_out')->default(false);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['plan_date', 'slot_start', 'item_id', 'variant_id'], 'ppr_day_slot_item_unique');
            $table->index('plan_date', 'ppr_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('production_plan_records');
        Schema::dropIfExists('production_plan_items');
        Schema::dropIfExists('production_calendar_periods');
    }
};
