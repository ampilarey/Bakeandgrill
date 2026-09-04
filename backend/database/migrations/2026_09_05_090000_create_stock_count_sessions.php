<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A stocktake as a session rather than a single POST.
 *
 * `POST /inventory/stock-count` already existed and writes every line the
 * moment it is called, from whatever the caller typed, with the on-hand figure
 * visible on screen while they typed it. That is fine for correcting one item
 * and wrong for a stocktake, for three reasons this table exists to fix:
 *
 *  1. A count takes an hour and a phone battery. Losing it to a dropped
 *     connection or a locked screen means counting the store room again, so
 *     the lines have to be saved as they are entered and posted later.
 *  2. Showing the expected figure while counting produces the expected figure.
 *     The snapshot is taken when the session opens and is not sent back to the
 *     counter — see StockCountSession::linesFor().
 *  3. The person who counted should not also be the person who accepts the
 *     variance. That is the same separation the refund flow already has.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_count_sessions', function (Blueprint $table) {
            $table->id();
            // Human reference for the floor: "SC-2026-0007".
            $table->string('reference', 32)->unique();
            // open      — lines exist, counting in progress, nothing written
            // submitted — counter is done; awaiting a second person
            // posted    — stock moved; terminal
            // cancelled — abandoned; terminal, nothing written
            $table->string('status', 16)->default('open');
            // Null scope means the whole store room.
            $table->foreignId('inventory_category_id')->nullable()
                ->constrained('inventory_categories')->nullOnDelete();
            $table->string('note', 500)->nullable();

            $table->foreignId('opened_by')->constrained('users')->cascadeOnDelete();
            $table->timestamp('opened_at');
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();

            $table->timestamps();
            $table->index(['status', 'opened_at']);
        });

        Schema::create('stock_count_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_count_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();

            /*
             * What the system believed when the session opened, and what the
             * item cost then.
             *
             * Frozen deliberately. Sales keep happening during a count, so
             * comparing a figure counted at 9pm against the on-hand at 11pm
             * would report a variance that is really just the evening's
             * trading. Posting moves stock by the difference against this
             * snapshot, not against live stock — see StockCountSessionService.
             */
            $table->decimal('snapshot_qty', 12, 3);
            $table->decimal('snapshot_unit_cost', 12, 4)->default(0);

            // Null until somebody counts it. A session may be posted with
            // uncounted lines; they are skipped, not treated as zero, because
            // "I did not get to the flour" is not "there is no flour".
            $table->decimal('counted_qty', 12, 3)->nullable();
            $table->string('note', 500)->nullable();
            $table->foreignId('counted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('counted_at')->nullable();

            $table->timestamps();
            $table->unique(['stock_count_session_id', 'inventory_item_id'], 'stock_count_lines_session_item_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_count_lines');
        Schema::dropIfExists('stock_count_sessions');
    }
};
