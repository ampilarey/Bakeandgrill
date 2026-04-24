<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed business_hours_json from the current config values so the site
        // renders identically the moment this migration runs.
        $configHours = config('opening_hours.hours', []);
        $hoursJson = json_encode($configHours, JSON_PRETTY_PRINT);

        $settings = [

            // ─── Pages group additions ────────────────────────────────────────
            [
                'key' => 'hours_open_status_text',
                'value' => "● We're open right now",
                'type' => 'text',
                'group' => 'Pages',
                'label' => 'Hours Page — Open Status Badge',
                'description' => 'Text shown in the status badge when the café is currently open',
                'is_public' => false,
            ],
            [
                'key' => 'hours_closed_status_text',
                'value' => '● Currently closed',
                'type' => 'text',
                'group' => 'Pages',
                'label' => 'Hours Page — Closed Status Badge',
                'description' => 'Text shown in the status badge when the café is currently closed',
                'is_public' => false,
            ],
            [
                'key' => 'terms_page_title',
                'value' => 'Terms & Conditions',
                'type' => 'text',
                'group' => 'Pages',
                'label' => 'Terms Page — Title',
                'description' => 'Main h1 heading on the Terms & Conditions page',
                'is_public' => false,
            ],
            [
                'key' => 'terms_page_subtitle',
                'value' => 'Please read these terms before completing your purchase.',
                'type' => 'text',
                'group' => 'Pages',
                'label' => 'Terms Page — Subtitle',
                'description' => 'Supporting line below the Terms page title',
                'is_public' => false,
            ],
            [
                'key' => 'terms_page_corporate_service_text',
                'value' => 'Customer service: Available via WhatsApp, Viber, or the contact details above.',
                'type' => 'text',
                'group' => 'Pages',
                'label' => 'Terms Page — Corporate Box Service Line',
                'description' => 'The customer service sentence shown in the corporate info box on the Terms page',
                'is_public' => false,
            ],
            [
                'key' => 'refund_page_title',
                'value' => 'Refund & Cancellation Policy',
                'type' => 'text',
                'group' => 'Pages',
                'label' => 'Refund Page — Title',
                'description' => 'Main h1 heading on the Refund & Cancellation page',
                'is_public' => false,
            ],
            [
                'key' => 'refund_page_subtitle',
                'value' => 'Please read this policy before completing your purchase.',
                'type' => 'text',
                'group' => 'Pages',
                'label' => 'Refund Page — Subtitle',
                'description' => 'Supporting line below the Refund page title',
                'is_public' => false,
            ],
            [
                'key' => 'privacy_page_title',
                'value' => 'Privacy Policy',
                'type' => 'text',
                'group' => 'Pages',
                'label' => 'Privacy Page — Title',
                'description' => 'Main h1 heading on the Privacy Policy page',
                'is_public' => false,
            ],
            [
                'key' => 'privacy_email',
                'value' => 'privacy@bakeandgrill.mv',
                'type' => 'text',
                'group' => 'Pages',
                'label' => 'Privacy Page — Privacy Contact Email',
                'description' => 'Email address shown in the Contact Us section of the Privacy Policy page',
                'is_public' => false,
            ],

            // ─── Legal group (optional body overrides) ────────────────────────
            // When non-empty, these replace the hardcoded Blade prose for the page body.
            // Plain text only — HTML is escaped and newlines are converted to <br>.
            // Leave empty to keep the existing hardcoded prose.
            [
                'key' => 'legal_terms_body',
                'value' => '',
                'type' => 'textarea',
                'group' => 'Legal',
                'label' => 'Terms & Conditions — Body Override (plain text)',
                'description' => 'If set, replaces the full Terms & Conditions body. Plain text only — HTML tags will be escaped. Leave empty to keep the current policy text.',
                'is_public' => false,
            ],
            [
                'key' => 'legal_refund_body',
                'value' => '',
                'type' => 'textarea',
                'group' => 'Legal',
                'label' => 'Refund Policy — Body Override (plain text)',
                'description' => 'If set, replaces the full Refund & Cancellation policy body. Plain text only. Leave empty to keep the current policy text.',
                'is_public' => false,
            ],
            [
                'key' => 'legal_privacy_body',
                'value' => '',
                'type' => 'textarea',
                'group' => 'Legal',
                'label' => 'Privacy Policy — Body Override (plain text)',
                'description' => 'If set, replaces the full Privacy Policy body. Plain text only. Leave empty to keep the current policy text.',
                'is_public' => false,
            ],

            // ─── Hours group (CMS-driven opening hours) ───────────────────────
            // business_hours_json: integer day keys (0=Sunday … 6=Saturday)
            // Each day: {"open":"HH:MM","close":"HH:MM"} or {"closed":true}
            // Seeded from config/opening_hours.php so site output is unchanged on deploy.
            [
                'key' => 'business_hours_json',
                'value' => $hoursJson,
                'type' => 'json',
                'group' => 'Hours',
                'label' => 'Weekly Opening Hours (JSON)',
                'description' => 'Opening hours for each day of the week. Keys 0–6 (0=Sunday). Each entry: {"open":"07:00","close":"23:00"} or {"closed":true}.',
                'is_public' => true,
            ],
            [
                'key' => 'business_closures_json',
                'value' => '{}',
                'type' => 'json',
                'group' => 'Hours',
                'label' => 'Special Closures (JSON)',
                'description' => 'One-off closure dates. Format: {"YYYY-MM-DD":"Reason for closure"}. Leave as {} if none.',
                'is_public' => true,
            ],
        ];

        foreach ($settings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()]),
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            // Pages additions
            'hours_open_status_text', 'hours_closed_status_text',
            'terms_page_title', 'terms_page_subtitle', 'terms_page_corporate_service_text',
            'refund_page_title', 'refund_page_subtitle',
            'privacy_page_title', 'privacy_email',
            // Legal group
            'legal_terms_body', 'legal_refund_body', 'legal_privacy_body',
            // Hours group
            'business_hours_json', 'business_closures_json',
        ])->delete();
    }
};
