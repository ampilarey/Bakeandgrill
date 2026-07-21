<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * FIX 6 — configurable maximum credit limit.
 *
 * Owner-only ceiling on how much credit any single customer can be approved
 * for. Non-owner actors are hard-rejected above this ceiling; the owner
 * may exceed with an audited override.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_settings')->updateOrInsert(
            ['key' => 'credit_limit_max_mvr'],
            [
                'value' => '50000',
                'type' => 'text',
                'group' => 'Customers',
                'label' => 'Max customer credit limit (MVR)',
                'description' => 'Highest credit limit a manager can approve without owner override.',
                'is_public' => false,
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'credit_limit_max_mvr')->delete();
    }
};
