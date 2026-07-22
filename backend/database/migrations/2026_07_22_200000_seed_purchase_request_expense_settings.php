<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Optional auto-expense when a purchase request is verified received.
 * Defaults OFF so existing manual convert-to-expense behaviour is unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            [
                'key' => 'purchase_requests_auto_expense',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Purchase Requests',
                'label' => 'Auto-create expense on verify',
                'description' => 'When enabled, verifying a received purchase request creates a pending expense (never auto-posted). Off by default.',
                'is_public' => false,
            ],
            [
                'key' => 'purchase_requests_default_expense_category_id',
                'value' => null,
                'type' => 'text',
                'group' => 'Purchase Requests',
                'label' => 'Default expense category for PR convert',
                'description' => 'Expense category id used when converting a purchase request to an expense. Falls back to the first category if empty.',
                'is_public' => false,
            ],
        ];

        foreach ($settings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()]),
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'purchase_requests_auto_expense',
            'purchase_requests_default_expense_category_id',
        ])->delete();
    }
};
