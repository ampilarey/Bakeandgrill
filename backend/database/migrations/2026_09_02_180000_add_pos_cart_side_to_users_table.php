<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which side of the till the ticket sits on, per cashier.
 *
 * Owner, 2026-09-02, among the POS layout changes: a left-hand option. The
 * ticket column is on the right of the menu by default; a cashier who works
 * the iPad with the other hand can put it on the left. Saved to the staff
 * account like the auto-lock minutes, so it follows them to any till.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // NULL = right (the default). 'left' puts the ticket before the menu.
            $table->string('pos_cart_side', 8)->nullable()->after('pos_idle_lock_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('pos_cart_side');
        });
    }
};
