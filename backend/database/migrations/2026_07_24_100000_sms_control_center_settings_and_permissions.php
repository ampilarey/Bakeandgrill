<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SMS Control Center: seed new SiteSetting toggles (defaults ON / kill switch OFF)
 * and resync role permissions for the new granular SMS slugs.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $settings = [
            [
                'key' => 'sms_global_kill_switch',
                'value' => 'false',
                'type' => 'boolean',
                'group' => 'sms',
                'label' => 'Global SMS kill switch',
                'description' => 'When on, blocks ALL outbound SMS including login OTP codes.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_catering_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'sms',
                'label' => 'Catering SMS',
                'description' => 'Customer and staff catering request/confirmation SMS.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_giftcard_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'sms',
                'label' => 'Gift card SMS',
                'description' => 'Gift card delivery SMS.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_restoration_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'sms',
                'label' => 'Service restoration SMS',
                'description' => 'We\'re-back restoration notifications.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_marketing_campaigns_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'sms',
                'label' => 'Marketing campaigns',
                'description' => 'Bulk SMS campaigns.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_marketing_promotions_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'sms',
                'label' => 'SMS promotions',
                'description' => 'SMS promotion blasts.',
                'is_public' => false,
            ],
        ];

        $hasScope = Schema::hasColumn('site_settings', 'scope');
        $hasLocale = Schema::hasColumn('site_settings', 'locale');

        foreach ($settings as $row) {
            $match = ['key' => $row['key']];
            if ($hasScope) {
                $match['scope'] = 'shared';
                $row['scope'] = 'shared';
            }
            if ($hasLocale) {
                $match['locale'] = 'en';
                $row['locale'] = 'en';
            }

            DB::table('site_settings')->updateOrInsert(
                $match,
                array_merge($row, [
                    'created_at' => $now,
                    'updated_at' => $now,
                ]),
            );
        }

        SiteSetting::bust();

        // Seed only the new Control Center templates (idempotent).
        $newTemplates = [
            [
                'slug' => 'auth_customer_otp',
                'name' => 'Customer Login OTP',
                'type' => 'customer_notification',
                'body' => 'Your Bake & Grill verification code is {{code}}. Valid for {{minutes}} minutes. Do not share this code.',
                'description' => 'Sent to customers for login / verification OTP.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'code', 'description' => 'OTP code'],
                    ['name' => 'minutes', 'description' => 'Validity in minutes'],
                    ['name' => 'brand', 'description' => 'Brand name'],
                ]),
            ],
            [
                'slug' => 'auth_staff_password_reset',
                'name' => 'Staff Password Reset OTP',
                'type' => 'order_notification',
                'body' => 'Your Bake & Grill admin password reset code is: {{code}}. Valid for {{minutes}} minutes.',
                'description' => 'Sent to staff for admin password reset.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'code', 'description' => 'OTP code'],
                    ['name' => 'minutes', 'description' => 'Validity in minutes'],
                    ['name' => 'brand', 'description' => 'Brand name'],
                ]),
            ],
            [
                'slug' => 'catering_request_received',
                'name' => 'Catering Request Received',
                'type' => 'customer_notification',
                'body' => 'Event request {{reference}} received. View details: {{view_url}}',
                'description' => 'Customer confirmation when an event request is submitted.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Event reference'],
                    ['name' => 'view_url', 'description' => 'Customer event URL'],
                    ['name' => 'contact_name', 'description' => 'Contact name'],
                ]),
            ],
            [
                'slug' => 'catering_request_staff',
                'name' => 'Catering Request (Staff)',
                'type' => 'order_notification',
                'body' => 'New event {{reference}}. View: {{view_url}}',
                'description' => 'Staff alert for a new event request.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Event reference'],
                    ['name' => 'view_url', 'description' => 'Admin event URL'],
                    ['name' => 'contact_name', 'description' => 'Contact name'],
                ]),
            ],
            [
                'slug' => 'catering_confirmed_customer',
                'name' => 'Catering Confirmed (Customer)',
                'type' => 'customer_notification',
                'body' => 'Event confirmed — ref {{reference}}, paid MVR {{paid}}{{balance_bit}}. {{when}}{{venue}}',
                'description' => 'Customer confirmation when quote payment confirms the event.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Event reference'],
                    ['name' => 'paid', 'description' => 'Amount paid (MVR)'],
                    ['name' => 'balance_bit', 'description' => 'Optional balance clause'],
                    ['name' => 'when', 'description' => 'Event date/time phrase'],
                    ['name' => 'venue', 'description' => 'Venue / delivery / pickup phrase'],
                ]),
            ],
            [
                'slug' => 'catering_confirmed_staff',
                'name' => 'Catering Confirmed (Staff)',
                'type' => 'order_notification',
                'body' => 'Event confirmed {{reference}}: paid MVR {{paid}}{{balance_bit}}. {{when}}',
                'description' => 'Staff alert when an event is confirmed.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Event reference'],
                    ['name' => 'paid', 'description' => 'Amount paid (MVR)'],
                    ['name' => 'balance_bit', 'description' => 'Optional balance clause'],
                    ['name' => 'when', 'description' => 'Event date/time phrase'],
                ]),
            ],
            [
                'slug' => 'giftcard_delivery',
                'name' => 'Gift Card Delivery',
                'type' => 'customer_notification',
                'body' => '',
                'description' => 'Gift card code delivery SMS. Empty body uses the PHP fallback.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'sender', 'description' => 'From line (optional)'],
                    ['name' => 'amount', 'description' => 'Card amount'],
                    ['name' => 'view_url', 'description' => 'View card URL'],
                    ['name' => 'code', 'description' => 'Gift card code'],
                    ['name' => 'expires', 'description' => 'Expiry date'],
                    ['name' => 'note', 'description' => 'Personal note'],
                ]),
            ],
            [
                'slug' => 'service_restoration',
                'name' => 'Service Restoration',
                'type' => 'customer_notification',
                'body' => '',
                'description' => 'Sent when a disabled service is restored. Empty body uses config default.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'label', 'description' => 'Service label'],
                    ['name' => 'url', 'description' => 'Order / menu URL'],
                    ['name' => 'service_key', 'description' => 'Service key'],
                    ['name' => 'incident_id', 'description' => 'Incident id'],
                ]),
            ],
        ];

        foreach ($newTemplates as $template) {
            DB::table('sms_templates')->updateOrInsert(
                ['slug' => $template['slug']],
                array_merge($template, [
                    'created_at' => $now,
                    'updated_at' => $now,
                ]),
            );
        }

        foreach (['owner', 'manager', 'staff'] as $slug) {
            Role::firstOrCreate(
                ['slug' => $slug],
                [
                    'name' => ucfirst($slug),
                    'description' => '',
                    'is_active' => true,
                ],
            );
        }

        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        // Settings and permissions are additive — no destructive rollback.
    }
};
