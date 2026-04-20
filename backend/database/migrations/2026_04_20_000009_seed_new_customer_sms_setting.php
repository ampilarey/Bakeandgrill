<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_settings')->updateOrInsert(
            ['key' => 'staff_sms_new_customer_enabled'],
            [
                'value'       => '1',
                'type'        => 'boolean',
                'group'       => 'notifications',
                'label'       => 'New Customer SMS Alert',
                'description' => 'Send SMS to staff when a new customer registers online or via POS.',
                'is_public'   => false,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]
        );
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'staff_sms_new_customer_enabled')->delete();
    }
};
