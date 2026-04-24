<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Name is always null at OTP-verify time (customer hasn't set it yet).
        // Show phone only so the message is accurate.
        DB::table('sms_templates')
            ->where('slug', 'customer_new')
            ->update([
                'body' => 'New customer registered: {{phone}}. Check admin panel.',
                'variables' => json_encode([
                    ['name' => 'phone', 'description' => 'Customer phone number'],
                ]),
            ]);
    }

    public function down(): void
    {
        DB::table('sms_templates')
            ->where('slug', 'customer_new')
            ->update([
                'body' => 'New customer registered: {{name}} ({{phone}}). Check admin panel.',
                'variables' => json_encode([
                    ['name' => 'name',  'description' => 'Customer name'],
                    ['name' => 'phone', 'description' => 'Customer phone number'],
                ]),
            ]);
    }
};
