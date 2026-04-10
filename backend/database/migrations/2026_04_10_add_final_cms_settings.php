<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $settings = [

            // ─── Contact group additions ──────────────────────────────────────
            [
                'key'         => 'contact_location_heading',
                'value'       => 'Our Location',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Location Card Heading',
                'description' => 'Heading on the location card of the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_location_maps_label',
                'value'       => 'Open in Maps →',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Maps Link Label',
                'description' => 'Label on the "Open in Maps" link on the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_touch_heading',
                'value'       => 'Get in Touch',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Contact Card Heading',
                'description' => 'Heading on the phone/email/messaging card of the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_phone_label',
                'value'       => 'Phone',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Phone Label',
                'description' => 'Label shown above the phone number on the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_email_label',
                'value'       => 'Email',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Email Label',
                'description' => 'Label shown above the email address on the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_whatsapp_label',
                'value'       => '💬 WhatsApp',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — WhatsApp Button Label',
                'description' => 'Text on the WhatsApp button on the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_viber_label',
                'value'       => '📱 Viber',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Viber Button Label',
                'description' => 'Text on the Viber button on the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_hours_heading',
                'value'       => 'Opening Hours',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Hours Card Heading',
                'description' => 'Heading on the opening hours card of the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_hours_fallback',
                // Newline-separated lines: "Days: HH:MM – HH:MM"
                // Parsed in Blade by splitting on \n then : to extract days/hours pairs.
                'value'       => "Sunday \xe2\x80\x93 Thursday: 7:00 AM \xe2\x80\x93 11:00 PM\nFriday \xe2\x80\x93 Saturday: 7:00 AM \xe2\x80\x93 2:00 AM",
                'type'        => 'textarea',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Hours Fallback Text',
                'description' => 'Shown on the Contact page hours card when no structured business_hours JSON is available. Format: one line per period, "Days: Times" (e.g. Sunday – Thursday: 7:00 AM – 11:00 PM)',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_schedule_label',
                'value'       => 'Full Schedule →',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Schedule Link Label',
                'description' => 'Label on the link to the full opening hours page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_map_heading',
                'value'       => '📍 Find Us on the Map',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Map Section Heading',
                'description' => 'Heading above the embedded map on the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_meta_title',
                'value'       => 'Contact Us – Bake & Grill',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Contact Page — Browser Title',
                'description' => 'The <title> tag shown in the browser tab for the Contact page',
                'is_public'   => false,
            ],

            // ─── Pages group additions ────────────────────────────────────────

            // Hours page
            [
                'key'         => 'hours_meta_title',
                'value'       => 'Opening Hours \xe2\x80\x93 Bake & Grill',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — Browser Title',
                'description' => 'The <title> tag shown in the browser tab for the Opening Hours page',
                'is_public'   => false,
            ],
            [
                'key'         => 'hours_meta_description',
                'value'       => 'See our opening hours. Bake & Grill is open 7 days a week in Mal\xc3\xa9, Maldives.',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — Meta Description',
                'description' => 'The meta description for the Opening Hours page (used by search engines)',
                'is_public'   => false,
            ],
            [
                'key'         => 'hours_special_closure_label',
                'value'       => 'Special Closure:',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — Special Closure Prefix',
                'description' => 'Bold prefix shown before the closure reason on the Opening Hours page (e.g. "Special Closure:")',
                'is_public'   => false,
            ],
            [
                'key'         => 'hours_call_confirm_label',
                'value'       => 'Call us to confirm:',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — Footer "Call to confirm" prefix',
                'description' => 'Text before the phone number in the footer note on the Opening Hours page',
                'is_public'   => false,
            ],
            [
                'key'         => 'hours_contact_page_label',
                'value'       => 'Contact page \xe2\x86\x92',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — Footer contact-page link label',
                'description' => 'Label for the link to the Contact page in the footer note on the Opening Hours page',
                'is_public'   => false,
            ],
            [
                'key'         => 'hours_order_btn_label',
                'value'       => '\xf0\x9f\x9b\x92 Order Online Now',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — CTA Button Label',
                'description' => 'Label on the "Order Online" button in the CTA block on the Opening Hours page',
                'is_public'   => false,
            ],

            // Terms page
            [
                'key'         => 'terms_meta_title',
                'value'       => 'Terms & Conditions - Bake & Grill',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Terms Page — Browser Title',
                'description' => 'The <title> tag shown in the browser tab for the Terms & Conditions page',
                'is_public'   => false,
            ],
            [
                'key'         => 'terms_phone_label',
                'value'       => 'Phone:',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Terms Page — Phone Label in Corporate Box',
                'description' => 'Label before the phone number in the corporate identity box on the Terms page',
                'is_public'   => false,
            ],
            [
                'key'         => 'terms_email_label',
                'value'       => 'Email:',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Terms Page — Email Label in Corporate Box',
                'description' => 'Label before the email address in the corporate identity box on the Terms page',
                'is_public'   => false,
            ],
            [
                'key'         => 'terms_last_updated_label',
                'value'       => 'Last updated:',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Terms Page — "Last updated" prefix',
                'description' => 'Prefix text before the auto-generated date at the bottom of the Terms page',
                'is_public'   => false,
            ],

            // Refund page
            [
                'key'         => 'refund_meta_title',
                'value'       => 'Refund & Cancellation Policy - Bake & Grill',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Refund Page — Browser Title',
                'description' => 'The <title> tag shown in the browser tab for the Refund & Cancellation page',
                'is_public'   => false,
            ],
            [
                'key'         => 'refund_last_updated_label',
                'value'       => 'Last updated:',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Refund Page — "Last updated" prefix',
                'description' => 'Prefix text before the auto-generated date at the bottom of the Refund page',
                'is_public'   => false,
            ],

            // Privacy page
            [
                'key'         => 'privacy_meta_title',
                'value'       => 'Privacy Policy - Bake & Grill',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Privacy Page — Browser Title',
                'description' => 'The <title> tag shown in the browser tab for the Privacy Policy page',
                'is_public'   => false,
            ],
            [
                'key'         => 'privacy_last_updated_label',
                'value'       => 'Last updated:',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Privacy Page — "Last updated" prefix',
                'description' => 'Prefix text before the auto-generated date at the bottom of the Privacy page',
                'is_public'   => false,
            ],
            [
                'key'         => 'privacy_email_label',
                'value'       => 'Email:',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Privacy Page — Email Label in Contact block',
                'description' => 'Label before the privacy contact email at the bottom of the Privacy page',
                'is_public'   => false,
            ],
            [
                'key'         => 'privacy_phone_label',
                'value'       => 'Phone:',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Privacy Page — Phone Label in Contact block',
                'description' => 'Label before the phone number at the bottom of the Privacy page',
                'is_public'   => false,
            ],
            [
                'key'         => 'privacy_address_label',
                'value'       => 'Address:',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Privacy Page — Address Label in Contact block',
                'description' => 'Label before the business address at the bottom of the Privacy page',
                'is_public'   => false,
            ],
        ];

        foreach ($settings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()])
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            // Contact group
            'contact_location_heading', 'contact_location_maps_label',
            'contact_touch_heading', 'contact_phone_label', 'contact_email_label',
            'contact_whatsapp_label', 'contact_viber_label', 'contact_hours_heading',
            'contact_hours_fallback', 'contact_schedule_label',
            'contact_map_heading', 'contact_meta_title',
            // Pages group — hours
            'hours_meta_title', 'hours_meta_description', 'hours_special_closure_label',
            'hours_call_confirm_label', 'hours_contact_page_label', 'hours_order_btn_label',
            // Pages group — terms
            'terms_meta_title', 'terms_phone_label', 'terms_email_label', 'terms_last_updated_label',
            // Pages group — refund
            'refund_meta_title', 'refund_last_updated_label',
            // Pages group — privacy
            'privacy_meta_title', 'privacy_last_updated_label',
            'privacy_email_label', 'privacy_phone_label', 'privacy_address_label',
        ])->delete();
    }
};
