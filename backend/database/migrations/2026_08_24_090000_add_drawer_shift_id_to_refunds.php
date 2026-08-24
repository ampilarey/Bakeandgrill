<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which drawer the refund cash actually left.
 *
 * `refunds.shift_id` records the shift the refund was *requested* in, and the
 * shift summary uses it for reporting. But the cash does not leave until an
 * authoriser approves, and the OTP / dual-approval workflow makes overnight
 * pendings ordinary — so a refund requested in Monday's shift and approved on
 * Tuesday took its money out of Tuesday's till while Monday's expected cash
 * was the one reduced. Tuesday counted short, and Monday's closed record
 * forked from the figure that had already been signed off.
 *
 * `drawer_shift_id` is stamped at approval with the shift that is actually
 * open then. Reporting attribution stays on `shift_id`; only the drawer
 * expectation moves.
 *
 * Nullable with no default, and expected-cash reads
 * COALESCE(drawer_shift_id, shift_id) — so every refund approved before this
 * migration keeps behaving exactly as it did, and history does not move.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('refunds') || Schema::hasColumn('refunds', 'drawer_shift_id')) {
            return;
        }

        Schema::table('refunds', function (Blueprint $table) {
            $table->unsignedBigInteger('drawer_shift_id')->nullable()->after('shift_id');
            $table->index('drawer_shift_id');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('refunds') || !Schema::hasColumn('refunds', 'drawer_shift_id')) {
            return;
        }

        Schema::table('refunds', function (Blueprint $table) {
            $table->dropIndex(['drawer_shift_id']);
            $table->dropColumn('drawer_shift_id');
        });
    }
};
