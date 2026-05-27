<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            [
                'key' => 'sms_customer_payment_confirmed_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'notifications',
                'label' => 'SMS: Payment Received (Receipt)',
                'description' => 'Send customer a receipt link SMS when payment is confirmed (POS charge and online BML).',
                'is_public' => false,
            ],
            [
                'key' => 'sms_customer_completion_receipt_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'notifications',
                'label' => 'SMS: Order Completed / Delivered (Receipt)',
                'description' => 'Send customer a receipt link SMS when an online pickup or delivery order is completed.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_pos_send_bill_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'notifications',
                'label' => 'SMS: POS Send Bill',
                'description' => 'Allow cashiers to SMS a pre-payment bill link from the POS.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_pos_send_pay_link_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'notifications',
                'label' => 'SMS: POS Send Pay Link',
                'description' => 'Allow cashiers to SMS a BML pay-page link from the POS.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_pos_fire_to_kitchen_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'notifications',
                'label' => 'SMS: POS Fire to Kitchen',
                'description' => 'SMS customer when a phone pickup order is fired to the kitchen from the POS.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_pos_receipt_resend_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'notifications',
                'label' => 'SMS: POS Receipt Resend',
                'description' => 'Allow cashiers to manually resend a receipt SMS from the POS.',
                'is_public' => false,
            ],
        ];

        foreach ($settings as $setting) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $setting['key']],
                array_merge($setting, [
                    'created_at' => now(),
                    'updated_at' => now(),
                ]),
            );
        }

        $templates = [
            [
                'slug' => 'customer_payment_confirmed_pos',
                'name' => 'Customer: Payment Receipt (Counter)',
                'type' => 'customer_notification',
                'body' => 'Receipt for #{{order_number}}: {{receipt_url}}',
                'description' => 'Sent to dine-in / takeaway customers when payment is received at the counter.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'receipt_url', 'description' => 'Public receipt page URL'],
                ]),
            ],
            [
                'slug' => 'customer_payment_confirmed_online',
                'name' => 'Customer: Payment Confirmed (Online)',
                'type' => 'customer_notification',
                'body' => 'Paid{{payment_method_suffix}}. #{{order_number}} confirmed. {{ready_hint}} {{tracking_url}}',
                'description' => 'Sent when an online pickup or delivery order payment is confirmed.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'payment_method_suffix', 'description' => 'e.g. " via BML Pay" or empty'],
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'ready_hint', 'description' => 'e.g. "We\'ll text when it\'s ready."'],
                    ['name' => 'tracking_url', 'description' => 'Order status tracking URL'],
                ]),
            ],
            [
                'slug' => 'customer_completion_receipt',
                'name' => 'Customer: Order Complete (Receipt)',
                'type' => 'customer_notification',
                'body' => 'Order #{{order_number}} complete. Receipt: {{receipt_url}}',
                'description' => 'Sent when an online pickup or delivery order reaches completed/delivered.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'receipt_url', 'description' => 'Public receipt page URL'],
                ]),
            ],
            [
                'slug' => 'customer_send_bill',
                'name' => 'Customer: Send Bill',
                'type' => 'customer_notification',
                'body' => 'Bill #{{invoice_number}} — MVR {{total}}. View: {{invoice_url}}',
                'description' => 'Sent when a cashier texts a pre-payment bill from the POS.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'invoice_number', 'description' => 'Invoice number'],
                    ['name' => 'total', 'description' => 'Formatted total, e.g. 12.50'],
                    ['name' => 'invoice_url', 'description' => 'Public invoice page URL'],
                ]),
            ],
            [
                'slug' => 'customer_send_pay_link',
                'name' => 'Customer: Send Pay Link',
                'type' => 'customer_notification',
                'body' => "{{greeting}} Your Bake & Grill bill is ready to pay.\nAmount: MVR {{amount}}\nOrder: {{order_number}}\nView your order & pay: {{pay_url}}\nThanks — see you soon!",
                'description' => 'Sent when a cashier texts a BML pay link from the POS.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'greeting', 'description' => 'e.g. "Hi Ali!" or "Hi!"'],
                    ['name' => 'amount', 'description' => 'Outstanding amount, e.g. 25.00'],
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'pay_url', 'description' => 'Pay page URL'],
                ]),
            ],
            [
                'slug' => 'customer_fire_to_kitchen',
                'name' => 'Customer: Fire to Kitchen',
                'type' => 'customer_notification',
                'body' => "{{greeting}} {{order_number}} received.\nOrder total: MVR {{total}}\n{{invoice_line}}\nWe'll text you when it's ready.",
                'description' => 'Sent when a phone pickup order is fired to the kitchen from the POS.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'greeting', 'description' => 'e.g. "Hi Ali, order" or "Order"'],
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'total', 'description' => 'Order total, e.g. 50.00'],
                    ['name' => 'invoice_line', 'description' => 'Optional line, e.g. "View invoice: https://..."'],
                ]),
            ],
            [
                'slug' => 'customer_receipt_resend',
                'name' => 'Customer: Receipt Resend',
                'type' => 'customer_notification',
                'body' => 'Thanks for visiting Bake & Grill! View your receipt: {{receipt_url}}',
                'description' => 'Sent when a cashier manually resends a receipt SMS from the POS.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'receipt_url', 'description' => 'Public receipt page URL'],
                ]),
            ],
            [
                'slug' => 'customer_order_preparing',
                'name' => 'Customer: Order Preparing',
                'type' => 'customer_notification',
                'body' => '#{{order_number}} is being prepared. We\'ll text when ready. {{tracking_url}}',
                'description' => 'Sent when kitchen starts preparing an online pickup or delivery order.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'tracking_url', 'description' => 'Order status tracking URL'],
                ]),
            ],
            [
                'slug' => 'customer_order_ready_pickup',
                'name' => 'Customer: Order Ready (Pickup)',
                'type' => 'customer_notification',
                'body' => '#{{order_number}} is ready for pickup. {{tracking_url}}',
                'description' => 'Sent when an online pickup order is marked ready.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'tracking_url', 'description' => 'Order status tracking URL'],
                ]),
            ],
            [
                'slug' => 'customer_order_ready_delivery',
                'name' => 'Customer: Order Ready (Delivery)',
                'type' => 'customer_notification',
                'body' => '#{{order_number}} is packed. Rider will pick up soon. {{tracking_url}}',
                'description' => 'Sent when a delivery order is marked ready/packed.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'tracking_url', 'description' => 'Order status tracking URL'],
                ]),
            ],
            [
                'slug' => 'customer_order_on_the_way',
                'name' => 'Customer: Out for Delivery',
                'type' => 'customer_notification',
                'body' => '#{{order_number}} is on the way. {{tracking_url}}',
                'description' => 'Sent when a delivery order is out for delivery.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'tracking_url', 'description' => 'Order status tracking URL'],
                ]),
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

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'sms_customer_payment_confirmed_enabled',
            'sms_customer_completion_receipt_enabled',
            'sms_pos_send_bill_enabled',
            'sms_pos_send_pay_link_enabled',
            'sms_pos_fire_to_kitchen_enabled',
            'sms_pos_receipt_resend_enabled',
        ])->delete();

        DB::table('sms_templates')->whereIn('slug', [
            'customer_payment_confirmed_pos',
            'customer_payment_confirmed_online',
            'customer_completion_receipt',
            'customer_send_bill',
            'customer_send_pay_link',
            'customer_fire_to_kitchen',
            'customer_receipt_resend',
            'customer_order_preparing',
            'customer_order_ready_pickup',
            'customer_order_ready_delivery',
            'customer_order_on_the_way',
        ])->delete();
    }
};
