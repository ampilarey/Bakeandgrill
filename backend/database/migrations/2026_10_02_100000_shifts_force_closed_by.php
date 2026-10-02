<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Shift history audit, 2026-10-02: a force-closed shift was only
 * recognisable by a note at the bottom of its detail, while its list row
 * showed a zero variance as if the drawer had been counted perfectly.
 * When and by whom it was forced are now columns so the list can badge it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            $table->timestamp('force_closed_at')->nullable()->after('notes');
            $table->unsignedBigInteger('force_closed_by')->nullable()->after('force_closed_at');
            $table->foreign('force_closed_by')->references('id')->on('users')->nullOnDelete();
        });

        // Old force-closes left their mark in the notes only; the closer's
        // name is in the note but not reliably a user, so only the time is
        // backfilled.
        $like = DB::getDriverName() === 'pgsql' ? 'ILIKE' : 'LIKE';
        DB::table('shifts')
            ->whereNotNull('closed_at')
            ->whereNull('force_closed_at')
            ->whereRaw("notes {$like} ?", ['%[Force closed by %'])
            ->update(['force_closed_at' => DB::raw('closed_at')]);
    }

    public function down(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            $table->dropForeign(['force_closed_by']);
            $table->dropColumn(['force_closed_by', 'force_closed_at']);
        });
    }
};
