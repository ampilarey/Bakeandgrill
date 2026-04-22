<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $body = 'New {{order_type}} #{{order_number}}. {{item_count}} item(s). Total: {{total}}. Customer: {{customer_phone}}. Check admin panel.';

        $variables = json_encode([
            ['name' => 'order_type',     'description' => 'Type of order: dine-in, takeaway, delivery'],
            ['name' => 'order_number',   'description' => 'Order reference number'],
            ['name' => 'item_count',     'description' => 'Number of items in the order'],
            ['name' => 'total',          'description' => 'Order total (formatted, e.g. MVR 12.50)'],
            ['name' => 'customer_phone', 'description' => 'Customer phone number'],
        ]);

        DB::table('sms_templates')
            ->where('slug', 'order_new')
            ->update(['body' => $body, 'variables' => $variables]);
    }

    public function down(): void
    {
        $body = 'New {{order_type}} #{{order_number}}. {{item_count}} item(s). Customer: {{customer_phone}}. Check admin panel.';

        $variables = json_encode([
            ['name' => 'order_type',     'description' => 'Type of order: dine-in, takeaway, delivery'],
            ['name' => 'order_number',   'description' => 'Order reference number'],
            ['name' => 'item_count',     'description' => 'Number of items in the order'],
            ['name' => 'customer_phone', 'description' => 'Customer phone number'],
        ]);

        DB::table('sms_templates')
            ->where('slug', 'order_new')
            ->update(['body' => $body, 'variables' => $variables]);
    }
};
