<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Complaints in practice (owner, 2026-09-21, phase B): a weekly summary
 * text, and a nudge when a complaint sits unread. `stale_reminded_at` is
 * when the nudge last went out for an entry, so it is not sent every day.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('complaint_box_entries', function (Blueprint $table) {
            $table->timestamp('stale_reminded_at')->nullable()->after('resolved_by');
        });

        $now = now();
        foreach ([
            ['key' => 'ops_complaint_weekly_sms', 'value' => '0', 'type' => 'boolean', 'label' => 'SMS: weekly complaint summary (owner)', 'description' => 'Every Monday, text the owner how many complaints came in, about what, and how many are still open.'],
            ['key' => 'ops_complaint_stale_sms', 'value' => '1', 'type' => 'boolean', 'label' => 'SMS: complaint left unread (owner)', 'description' => 'Text the owner when a complaint has sat as "new" for longer than the days below.'],
            ['key' => 'ops_complaint_stale_days', 'value' => '2', 'type' => 'integer', 'label' => 'Days before a complaint counts as left unread', 'description' => 'How long a complaint may sit as "new" before the owner is nudged.'],
        ] as $s) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $s['key']],
                array_merge($s, ['group' => 'Complaints', 'is_public' => false, 'created_at' => $now, 'updated_at' => $now]),
            );
        }
    }

    public function down(): void
    {
        Schema::table('complaint_box_entries', function (Blueprint $table) {
            $table->dropColumn('stale_reminded_at');
        });
        DB::table('site_settings')->whereIn('key', ['ops_complaint_weekly_sms', 'ops_complaint_stale_sms', 'ops_complaint_stale_days'])->delete();
    }
};
