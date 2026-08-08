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
            // ── SMS Control Center migrations (OTP / catering / gift card / restoration) ──
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
                'body' => 'Event confirmed - ref {{reference}}, paid MVR {{paid}}{{balance_bit}}. {{when}}{{venue}}',
                'description' => 'Customer confirmation when quote payment confirms the event.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Event reference'],
                    ['name' => 'paid', 'description' => 'Amount paid (MVR)'],
                    ['name' => 'balance_bit', 'description' => 'Optional balance clause'],
                    ['name' => 'when', 'description' => 'Event date/time phrase'],
                    ['name' => 'venue', 'description' => 'Venue / delivery / pickup phrase'],
                    ['name' => 'event_date', 'description' => 'Event date'],
                    ['name' => 'contact_name', 'description' => 'Contact name'],
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
                    ['name' => 'event_date', 'description' => 'Event date'],
                    ['name' => 'contact_name', 'description' => 'Contact name'],
                ]),
            ],
            [
                'slug' => 'giftcard_delivery',
                'name' => 'Gift Card Delivery',
                'type' => 'customer_notification',
                'body' => '',
                'description' => 'Gift card code delivery SMS. Empty body uses the PHP fallback (identical to pre-Control-Center wording).',
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
                'description' => 'Sent when a disabled service is restored. Empty body uses config/service_availability.php default.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'label', 'description' => 'Service label'],
                    ['name' => 'url', 'description' => 'Order / menu URL'],
                    ['name' => 'service_key', 'description' => 'Service key'],
                    ['name' => 'incident_id', 'description' => 'Incident id'],
                ]),
            ],
            [
                'slug' => 'discount_approval_otp',
                'name' => 'Discount Approval OTP',
                'type' => 'system',
                'body' => 'Bake & Grill: approval code {{code}} for a {{percent}}% ({{amount}}) discount on order {{order}}. Expires in {{minutes}} min. Do not share.',
                'description' => 'One-time code sent to discount approvers for POS manual discounts.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'code', 'description' => '4-digit approval code'],
                    ['name' => 'percent', 'description' => 'Discount percent of subtotal'],
                    ['name' => 'amount', 'description' => 'Discount amount (formatted)'],
                    ['name' => 'order', 'description' => 'Order number or id'],
                    ['name' => 'minutes', 'description' => 'Code TTL in minutes'],
                ]),
            ],
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
            ],
            [
                'slug' => 'staff_refund_requested',
                'name' => 'Refund awaiting approval (staff)',
                'type' => 'order_notification',
                'body' => 'Refund request on {{order_number}} for MVR {{amount}} (phone {{phone}}) needs approval. Open Refunds in admin.',
                'description' => 'Sent to staff with refund approval rights when a request is raised.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'amount', 'description' => 'Refund amount in MVR'],
                    ['name' => 'phone', 'description' => 'Refund phone number'],
                ]),
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
                    ['name' => 'no_contact_count', 'description' => 'Legacy no-contact count'],
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
}
