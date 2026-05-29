<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        DB::table('site_settings')->updateOrInsert(
            ['key' => 'eid_hours_preset'],
            [
                'value' => json_encode([
                    'mon' => '10:00 AM – 11:00 PM',
                    'tue' => '10:00 AM – 11:00 PM',
                    'wed' => '10:00 AM – 11:00 PM',
                    'thu' => '10:00 AM – 11:00 PM',
                    'fri' => '10:00 AM – 11:00 PM',
                    'sat' => '10:00 AM – 11:00 PM',
                    'sun' => '10:00 AM – 11:00 PM',
                ], JSON_THROW_ON_ERROR),
                'type' => 'json',
                'group' => 'Ordering',
                'label' => 'Eid hours preset',
                'description' => 'Optional JSON template for Eid / holiday opening hours',
                'is_public' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        if (Schema::hasTable('site_settings')) {
            DB::table('site_settings')->where('key', 'eid_hours_preset')->delete();
        }
    }
};
