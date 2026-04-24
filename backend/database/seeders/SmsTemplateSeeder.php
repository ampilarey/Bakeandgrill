<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SmsTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $templates = [
            [
                'slug' => 'order_new',
                'name' => 'New Order',
                'type' => 'order_notification',
                'body' => 'New {{order_type}} #{{order_number}}. {{item_count}} item(s). Total: {{total}}. Customer: {{customer_phone}}. Check admin panel.',
                'description' => 'Sent to staff when a new order is placed.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_type',      'description' => 'Type of order: dine-in, takeaway, delivery'],
                    ['name' => 'order_number',    'description' => 'Order reference number'],
                    ['name' => 'item_count',      'description' => 'Number of items in the order'],
                    ['name' => 'total',           'description' => 'Order total (formatted, e.g. MVR 12.50)'],
                    ['name' => 'customer_phone',  'description' => 'Customer phone number'],
                ]),
            ],
            [
                'slug' => 'order_ready',
                'name' => 'Order Ready',
                'type' => 'order_notification',
                'body' => 'Order #{{order_number}} ({{order_type}}) is ready.',
                'description' => 'Sent to staff when an order is marked ready.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'order_type',   'description' => 'Type of order'],
                ]),
            ],
            [
                'slug' => 'order_out_for_delivery',
                'name' => 'Order Out for Delivery',
                'type' => 'order_notification',
                'body' => 'Order #{{order_number}} is out for delivery.',
                'description' => 'Sent when an order is on its way to the customer.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                ]),
            ],
            [
                'slug' => 'no_staff_found',
                'name' => 'No Active Staff Found',
                'type' => 'order_notification',
                'body' => 'No active staff for order #{{order_number}}. Manager action needed.',
                'description' => 'Sent to fallback recipient when no matching staff is on shift.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                ]),
            ],
            [
                'slug' => 'schedule_assigned',
                'name' => 'Shift Assigned',
                'type' => 'schedule_reminder',
                'body' => 'Shift assigned: {{date}}, {{start}} - {{end}}. See you at Bake & Grill!',
                'description' => 'Sent to a staff member when a new shift is assigned to them.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'date',  'description' => 'Date of the shift (e.g. Mon, 21 Apr)'],
                    ['name' => 'start', 'description' => 'Shift start time (e.g. 09:00)'],
                    ['name' => 'end',   'description' => 'Shift end time (e.g. 17:00)'],
                ]),
            ],
            [
                'slug' => 'shift_reminder',
                'name' => 'Shift Reminder',
                'type' => 'schedule_reminder',
                'body' => 'Reminder: Your shift today is {{start}} - {{end}}. Bake & Grill.',
                'description' => 'Sent 1 hour before a staff member\'s shift starts.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'start', 'description' => 'Shift start time'],
                    ['name' => 'end',   'description' => 'Shift end time'],
                ]),
            ],
            [
                'slug' => 'weekly_schedule',
                'name' => 'Weekly Schedule Summary',
                'type' => 'schedule_reminder',
                'body' => 'Your upcoming shifts this week: {{schedule_summary}}.',
                'description' => 'Weekly summary of a staff member\'s upcoming shifts.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'schedule_summary', 'description' => 'A short list of upcoming shift times'],
                ]),
            ],
            [
                'slug' => 'customer_new',
                'name' => 'New Customer Registered',
                'type' => 'order_notification',
                'body' => 'New customer registered: {{phone}}. Check admin panel.',
                'description' => 'Sent to staff when a new customer registers online or via POS.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'name',  'description' => 'Customer name (or "Unknown" if not set)'],
                    ['name' => 'phone', 'description' => 'Customer phone number'],
                ]),
            ],
            [
                'slug' => 'custom',
                'name' => 'Custom Message',
                'type' => 'custom',
                'body' => '',
                'description' => 'Blank template for custom one-off messages.',
                'is_system' => false,
                'variables' => null,
            ],
        ];

        foreach ($templates as $template) {
            DB::table('sms_templates')->updateOrInsert(
                ['slug' => $template['slug']],
                array_merge($template, [
                    'created_at' => now(),
                    'updated_at' => now(),
                ]),
            );
        }
    }
}
