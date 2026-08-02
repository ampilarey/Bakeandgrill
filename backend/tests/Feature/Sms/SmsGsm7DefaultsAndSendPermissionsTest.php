<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\SmsTemplate;
use App\Models\User;
use Database\Seeders\SmsTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Guards against pasting non-GSM-7 punctuation into default SMS copy,
 * and keeps Control Center send-permission options send-governing only.
 */
class SmsGsm7DefaultsAndSendPermissionsTest extends TestCase
{
    use RefreshDatabase;

    private SmsService $sms;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        (new SmsTemplateSeeder)->run();

        $this->sms = app(SmsService::class);
        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-gsm7@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
    }

    public function test_every_default_sms_template_body_encodes_as_gsm7(): void
    {
        $templates = SmsTemplate::query()->where('body', '!=', '')->get();
        $this->assertNotEmpty($templates);

        foreach ($templates as $tpl) {
            $estimate = $this->sms->estimate((string) $tpl->body);
            $this->assertNotSame(
                'ucs2',
                $estimate['encoding'],
                "Template {$tpl->slug} encodes as UCS-2 — remove non-GSM-7 characters from the default body.",
            );
            $this->assertSame('gsm7', $estimate['encoding'], $tpl->slug);
        }
    }

    public function test_code_fallback_sms_bodies_encode_as_gsm7(): void
    {
        foreach ($this->codeFallbackBodies() as $label => $body) {
            $estimate = $this->sms->estimate($body);
            $this->assertNotSame(
                'ucs2',
                $estimate['encoding'],
                "Fallback [{$label}] encodes as UCS-2 — remove non-GSM-7 characters.",
            );
            $this->assertSame('gsm7', $estimate['encoding'], $label);
        }
    }

    public function test_rendered_pos_bill_example_is_one_gsm7_segment(): void
    {
        // Realistic POS bill (~72 code points): hyphen stays GSM-7 / 1 segment;
        // the same text with an em dash flips to UCS-2 / 2 segments.
        $body = 'Bill #INV-1042 - MVR 128.50. View: https://bakeandgrill.mv/invoices/demo72';
        $estimate = $this->sms->estimate($body);

        $this->assertSame('gsm7', $estimate['encoding']);
        $this->assertSame(1, $estimate['segments']);
        $this->assertGreaterThan(70, $estimate['length']);

        $withEmDash = 'Bill #INV-1042 — MVR 128.50. View: https://bakeandgrill.mv/invoices/demo72';
        $bad = $this->sms->estimate($withEmDash);
        $this->assertSame('ucs2', $bad['encoding']);
        $this->assertSame(2, $bad['segments']);
    }

    public function test_em_dash_migration_updates_untouched_defaults_only(): void
    {
        $oldBill = 'Bill #{{invoice_number}} — MVR {{total}}. View: {{invoice_url}}';
        $newBill = 'Bill #{{invoice_number}} - MVR {{total}}. View: {{invoice_url}}';
        $custom = 'Custom bill wording with an em dash — keep me';

        DB::table('sms_templates')->where('slug', 'customer_send_bill')->update([
            'body' => $oldBill,
            'updated_at' => now(),
        ]);
        DB::table('sms_templates')->where('slug', 'customer_send_pay_link')->update([
            'body' => "{{greeting}} Your Bake & Grill bill is ready to pay.\nAmount: MVR {{amount}}\nOrder: {{order_number}}\nView your order & pay: {{pay_url}}\nThanks — see you soon!",
            'updated_at' => now(),
        ]);
        DB::table('sms_templates')->where('slug', 'catering_confirmed_customer')->update([
            'body' => $custom,
            'updated_at' => now(),
        ]);

        // Re-run the migration's up() logic via migrate:refresh of that file is heavy;
        // invoke the anonymous migration class from the filesystem instead.
        $path = database_path('migrations/2026_08_02_020000_replace_em_dashes_in_default_sms_templates.php');
        $migration = require $path;
        $migration->up();

        $this->assertSame(
            $newBill,
            DB::table('sms_templates')->where('slug', 'customer_send_bill')->value('body'),
        );
        $this->assertSame(
            "{{greeting}} Your Bake & Grill bill is ready to pay.\nAmount: MVR {{amount}}\nOrder: {{order_number}}\nView your order & pay: {{pay_url}}\nThanks - see you soon!",
            DB::table('sms_templates')->where('slug', 'customer_send_pay_link')->value('body'),
        );
        $this->assertSame(
            $custom,
            DB::table('sms_templates')->where('slug', 'catering_confirmed_customer')->value('body'),
            'Admin-customised body must not be overwritten',
        );
    }

    public function test_permission_options_are_send_governing_plus_system(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $res = $this->getJson('/api/admin/sms/control-center')->assertOk();
        $options = collect($res->json('permission_options'));
        $slugs = $options->pluck('slug')->all();

        $this->assertSame(SmsTypeRegistry::SYSTEM_SEND_PERMISSION, $slugs[0]);
        $this->assertStringContainsString('System-initiated', (string) $options->first()['name']);

        foreach (SmsTypeRegistry::ASSIGNABLE_SEND_PERMISSIONS as $slug) {
            $this->assertContains($slug, $slugs);
        }

        $this->assertNotContains('sms.templates.edit', $slugs);
        $this->assertNotContains('sms.settings.manage', $slugs);

        $this->assertSame(
            [SmsTypeRegistry::SYSTEM_SEND_PERMISSION, ...SmsTypeRegistry::ASSIGNABLE_SEND_PERMISSIONS],
            $slugs,
        );
    }

    public function test_management_permissions_rejected_as_send_permission(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->patchJson('/api/admin/sms/types/giftcard_delivery', [
            'send_permission' => 'sms.templates.edit',
        ])->assertStatus(422);

        $this->patchJson('/api/admin/sms/types/giftcard_delivery', [
            'send_permission' => 'sms.settings.manage',
        ])->assertStatus(422);

        $this->patchJson('/api/admin/sms/types/giftcard_delivery', [
            'send_permission' => 'orders.send_sms_bill',
        ])->assertOk();
    }

    /**
     * Representative code/config fallbacks that are sent when templates are empty.
     *
     * @return array<string, string>
     */
    private function codeFallbackBodies(): array
    {
        return [
            'pos_send_bill' => 'Bill #INV-1 - MVR 12.50. View: https://bakeandgrill.mv/i/x',
            'pos_send_pay_link' => "Hi Aisha!\nYour Bake & Grill bill is ready to pay.\nAmount: MVR 128.50\nOrder: 1042\nView your order & pay: https://bakeandgrill.mv/pay/x\nThanks - see you soon!",
            'restoration_default' => (string) config('service_availability.restoration_sms.default_template'),
            'restoration_online' => (string) config('service_availability.restoration_sms.templates.online_checkout'),
            'restoration_delivery' => (string) config('service_availability.restoration_sms.templates.online_delivery'),
            'restoration_pickup' => (string) config('service_availability.restoration_sms.templates.online_pickup'),
            'restoration_catering' => (string) config('service_availability.restoration_sms.templates.catering_inquiry'),
            'credit_upcoming' => 'Bake & Grill: Credit invoice INV-1 - MVR 10.00 due on 01 Aug 2026. View: https://x.test/i/1',
            'credit_due_today' => 'Bake & Grill: Credit payment due today - invoice INV-1, MVR 10.00. View: https://x.test/i/1',
            'catering_confirmed' => 'Event confirmed - ref EVT-1, paid MVR 500.00. Sat 2pm at Male\'',
            'catering_quote' => 'Quote EVT-1 ready - pay MVR 100.00: https://x.test/q/1',
            'catering_expired' => 'Your quote EVT-1 expired - contact us to renew',
            'catering_reminder' => 'Reminder: event EVT-1 is tomorrow (Sat, 2 Aug 2pm) - pickup',
            'otp' => 'Your Bake & Grill verification code is 123456. Valid for 10 minutes. Do not share this code.',
            'receipt_resend' => 'Thanks for visiting Bake & Grill! View your receipt: https://x.test/r/1',
            'completion' => 'Order #1042 complete. Receipt: https://x.test/r/1',
        ];
    }
}
