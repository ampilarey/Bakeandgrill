<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * customers.loyalty_points and customers.tier were written once at sign-up
 * and never again; the admin customer list, the POS search and the login
 * payload read them (audit, 2026-09-24). The LoyaltyAccount model now
 * mirrors every change across; this copies today's balances over once.
 * Portable: chunked in PHP rather than an UPDATE … JOIN.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('loyalty_accounts')
            ->select(['customer_id', 'points_balance', 'tier'])
            ->orderBy('customer_id')
            ->chunk(500, function ($rows): void {
                foreach ($rows as $row) {
                    DB::table('customers')
                        ->where('id', $row->customer_id)
                        ->update([
                            'loyalty_points' => (int) $row->points_balance,
                            'tier' => (string) ($row->tier ?: 'bronze'),
                        ]);
                }
            });
    }

    public function down(): void
    {
        // The copy is derived data; nothing to restore.
    }
};
