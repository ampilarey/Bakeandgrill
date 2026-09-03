<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Credit settings audit, 2026-09-03.
 *
 * F4 — a house default for payment terms, instead of a constant in the code.
 * F7 — a single switch for credit: open, no new accounts (wind existing ones
 *      down), or closed to new charges altogether.
 * The ceiling itself (credit_limit_max_mvr) was seeded in 2026_07_21_200200;
 * this migration only gives the other two the same treatment. No permission
 * changes here — F2 is left to the owner (see the audit report).
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = [
            [
                'key' => 'credit_payment_terms_default_days',
                'value' => '30',
                'label' => 'Default credit payment terms (days)',
                'description' => 'How long a new credit account gets to pay, unless the approver sets otherwise. 7–90.',
            ],
            [
                'key' => 'credit_accounts_mode',
                'value' => 'open',
                'label' => 'Credit accounts',
                'description' => 'open = normal; no_new_accounts = existing accounts only; closed = no new charges (repayments always allowed).',
            ],
        ];

        foreach ($rows as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                [
                    'value' => $row['value'],
                    'type' => 'text',
                    'group' => 'Customers',
                    'label' => $row['label'],
                    'description' => $row['description'],
                    'is_public' => false,
                    'updated_at' => now(),
                    'created_at' => now(),
                ],
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')
            ->whereIn('key', ['credit_payment_terms_default_days', 'credit_accounts_mode'])
            ->delete();
    }
};
