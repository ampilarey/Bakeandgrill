<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Correct misleading help text: empty delivery_schedule means always-open
 * while delivery is accepting — not “same hours as online ordering”.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_settings')
            ->where('key', 'delivery_schedule')
            ->update([
                'description' => 'JSON day windows for delivery. Leave empty for all-day delivery while accepting is ON. Days absent / disabled = no delivery that day. Independent from online ordering hours.',
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        DB::table('site_settings')
            ->where('key', 'delivery_schedule')
            ->update([
                'description' => 'JSON: {"mon":{"open":"08:00","close":"22:00"},…}. Leave empty to use the same hours as online ordering. Days absent = no delivery that day.',
                'updated_at' => now(),
            ]);
    }
};
