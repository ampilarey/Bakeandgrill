<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $templates = [
            [
                'slug' => 'owner_complaint_received',
                'name' => 'Complaint received (owner)',
                'type' => 'order_notification',
                'body' => 'Complaint {{reference}} on order {{order_number}}: {{category}}. Open Complaints in admin.',
                'description' => 'Sent to owner when a customer complaint is recorded.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Complaint reference'],
                    ['name' => 'order_number', 'description' => 'Order number'],
                    ['name' => 'category', 'description' => 'Complaint category label'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'slug' => 'owner_complaint_received_urgent',
                'name' => 'Food-safety complaint (owner)',
                'type' => 'order_notification',
                'body' => 'URGENT food safety/allergy complaint {{reference}} on order {{order_number}}. Open Complaints in admin now.',
                'description' => 'Urgent owner alert for food safety / allergy complaints.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Complaint reference'],
                    ['name' => 'order_number', 'description' => 'Order number'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'slug' => 'customer_complaint_acknowledged',
                'name' => 'Complaint acknowledged (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: we received your concern ({{reference}}). We will look into it.',
                'description' => 'Acknowledgement SMS to the customer after a complaint is logged.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Complaint reference'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'slug' => 'customer_complaint_resolved',
                'name' => 'Complaint resolved (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill ({{reference}}): {{customer_reply}}',
                'description' => 'Sent when a complaint is marked resolved — uses the owner customer reply.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Complaint reference'],
                    ['name' => 'customer_reply', 'description' => 'Owner reply shown to the customer'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ];

        foreach ($templates as $row) {
            DB::table('sms_templates')->updateOrInsert(['slug' => $row['slug']], $row);
        }

        $settings = [
            ['key' => 'sms_owner_complaint_received_enabled', 'value' => '1', 'label' => 'SMS: complaint received (owner)'],
            ['key' => 'sms_customer_complaint_acknowledged_enabled', 'value' => '1', 'label' => 'SMS: complaint acknowledged (customer)'],
            ['key' => 'sms_customer_complaint_resolved_enabled', 'value' => '1', 'label' => 'SMS: complaint resolved (customer)'],
            ['key' => 'complaint_window_food_hours', 'value' => '48', 'label' => 'Complaint window — food (hours)', 'type' => 'text', 'group' => 'Complaints'],
            ['key' => 'complaint_window_billing_hours', 'value' => '720', 'label' => 'Complaint window — billing (hours)', 'type' => 'text', 'group' => 'Complaints'],
            ['key' => 'complaint_open_cap_per_receipt', 'value' => '3', 'label' => 'Max open complaints per receipt', 'type' => 'text', 'group' => 'Complaints'],
        ];

        foreach ($settings as $s) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $s['key']],
                [
                    'value' => $s['value'],
                    'type' => $s['type'] ?? 'boolean',
                    'group' => $s['group'] ?? 'SMS',
                    'label' => $s['label'],
                    'description' => $s['label'],
                    'is_public' => false,
                    'updated_at' => $now,
                    'created_at' => $now,
                ],
            );
        }

        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        DB::table('sms_templates')->whereIn('slug', [
            'owner_complaint_received',
            'owner_complaint_received_urgent',
            'customer_complaint_acknowledged',
            'customer_complaint_resolved',
        ])->delete();

        DB::table('site_settings')->whereIn('key', [
            'sms_owner_complaint_received_enabled',
            'sms_customer_complaint_acknowledged_enabled',
            'sms_customer_complaint_resolved_enabled',
            'complaint_window_food_hours',
            'complaint_window_billing_hours',
            'complaint_open_cap_per_receipt',
        ])->delete();
    }
};
