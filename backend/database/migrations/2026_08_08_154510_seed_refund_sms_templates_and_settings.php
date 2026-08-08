<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $templates = [
            [
                'slug' => 'customer_refund_requested',
                'name' => 'Refund requested (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: a refund has been requested on order {{order_number}}. We will message you again when it is processed.',
                'description' => 'Sent to the order phone when staff raise a refund request.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'slug' => 'customer_refund_completed',
                'name' => 'Refund completed (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: your refund on order {{order_number}} has been processed.',
                'description' => 'Sent to the order phone when a refund is approved and completed.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'slug' => 'staff_refund_requested',
                'name' => 'Refund awaiting approval (staff)',
                'type' => 'order_notification',
                'body' => 'Refund request on {{order_number}} for MVR {{amount}} needs approval. Open Refunds in admin.',
                'description' => 'Sent to staff with refund approval rights when a request is raised.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'amount', 'description' => 'Refund amount in MVR'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'slug' => 'owner_daily_refund_summary',
                'name' => 'Daily refund summary (owner)',
                'type' => 'order_notification',
                'body' => 'Refunds yesterday: {{count}} totaling MVR {{total}}. Phone-added: {{phone_added_count}}. OTP overrides: {{otp_override_count}}. Details in admin Refunds.',
                'description' => 'Daily owner summary of refund activity with phone flags.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'count', 'description' => 'Number of refunds'],
                    ['name' => 'total', 'description' => 'Total refunded amount MVR'],
                    ['name' => 'phone_added_count', 'description' => 'Refunds where cashier added the phone'],
                    ['name' => 'otp_override_count', 'description' => 'Owner completions without OTP'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'slug' => 'customer_refund_otp',
                'name' => 'Refund verification OTP (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: code {{code}} confirms a refund on order {{order_number}}. Tell the cashier this code. Expires in {{minutes}} min.',
                'description' => 'OTP sent to the refund phone; customer reads it to the cashier.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'code', 'description' => 'One-time verification code'],
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'minutes', 'description' => 'Minutes until expiry'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ];

        foreach ($templates as $row) {
            DB::table('sms_templates')->updateOrInsert(['slug' => $row['slug']], $row);
        }

        $settings = [
            ['key' => 'sms_customer_refund_requested_enabled', 'value' => '1', 'label' => 'SMS: refund requested (customer)'],
            ['key' => 'sms_customer_refund_completed_enabled', 'value' => '1', 'label' => 'SMS: refund completed (customer)'],
            ['key' => 'sms_staff_refund_requested_enabled', 'value' => '1', 'label' => 'SMS: refund awaiting approval (staff)'],
            ['key' => 'sms_owner_daily_refund_summary_enabled', 'value' => '1', 'label' => 'SMS: daily refund summary (owner)'],
        ];

        foreach ($settings as $s) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $s['key']],
                [
                    'value' => $s['value'],
                    'type' => 'boolean',
                    'group' => 'SMS',
                    'label' => $s['label'],
                    'description' => $s['label'],
                    'is_public' => false,
                    'updated_at' => $now,
                    'created_at' => $now,
                ],
            );
        }
    }

    public function down(): void
    {
        DB::table('sms_templates')->whereIn('slug', [
            'customer_refund_requested',
            'customer_refund_completed',
            'customer_refund_otp',
            'staff_refund_requested',
            'owner_daily_refund_summary',
        ])->delete();

        DB::table('site_settings')->whereIn('key', [
            'sms_customer_refund_requested_enabled',
            'sms_customer_refund_completed_enabled',
            'sms_staff_refund_requested_enabled',
            'sms_owner_daily_refund_summary_enabled',
        ])->delete();
    }
};
