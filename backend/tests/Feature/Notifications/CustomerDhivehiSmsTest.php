<?php

declare(strict_types=1);

namespace Tests\Feature\Notifications;

use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Support\CustomerSmsText;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Mail\CustomerOtpMail;
use App\Models\Customer;
use App\Models\SiteSetting;
use App\Models\SmsTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** A customer who keeps Dhivehi gets texts in Dhivehi while the switch is on (iruali import plan, 3b). */
class CustomerDhivehiSmsTest extends TestCase
{
    use RefreshDatabase;

    private function dhivehi(bool $on): void
    {
        SiteSetting::set('language_switcher_enabled', $on ? 'true' : 'false', 'website', 'en');
    }

    private function build(string $to): string
    {
        return app(CustomerSmsMessageBuilder::class)->build(
            'customer_order_ready_pickup',
            ['order_number' => '1042', 'tracking_url' => 'https://x.test/t'],
            '#{{order_number}} is ready for pickup. {{tracking_url}}',
            $to,
        );
    }

    public function test_a_dhivehi_customer_gets_dhivehi_and_everyone_else_english(): void
    {
        $this->dhivehi(true);
        Customer::factory()->create(['phone' => '+9607771111', 'preferred_language' => 'dv']);
        Customer::factory()->create(['phone' => '+9607772222', 'preferred_language' => 'en']);

        $this->assertSame('#1042 ނަގަން ތައްޔާރު. https://x.test/t', $this->build('7771111'));
        $this->assertSame('#1042 is ready for pickup. https://x.test/t', $this->build('7772222'));
        $this->assertSame('#1042 is ready for pickup. https://x.test/t', $this->build('7773333'));
        $this->assertSame('en', CustomerSmsText::language(null));
    }

    public function test_switched_off_everyone_gets_english(): void
    {
        $this->dhivehi(false);
        Customer::factory()->create(['phone' => '+9607771111', 'preferred_language' => 'dv']);

        $this->assertSame('#1042 is ready for pickup. https://x.test/t', $this->build('+960 777 1111'));
    }

    public function test_the_owners_dhivehi_wording_wins_over_the_draft(): void
    {
        $this->dhivehi(true);
        Customer::factory()->create(['phone' => '+9607771111', 'preferred_language' => 'dv']);
        SmsTemplate::query()->updateOrCreate(['slug' => 'customer_order_ready_pickup'], [
            'name' => 'Ready', 'type' => 'customer_notification', 'body' => '#{{order_number}} ready', 'body_dv' => '#{{order_number}} ތައްޔާރު!', 'is_system' => true, 'variables' => [],
        ]);

        $this->assertSame('#1042 ތައްޔާރު!', $this->build('7771111'));
    }

    public function test_admin_edits_the_dhivehi_wording_on_a_customer_row_only(): void
    {
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(['phone' => '7770001']), ['staff']);

        $row = collect($this->getJson('/api/admin/sms/control-center')->assertOk()->json('types'))->firstWhere('key', 'customer_order_ready');
        $this->assertSame(CustomerSmsText::DEFAULTS['customer_order_ready_pickup'], $row['template']['dv_default'] ?? null);
        $this->assertSame(CustomerSmsText::DEFAULTS['customer_order_ready_delivery'], $row['extra_templates'][0]['dv_default'] ?? null);

        $this->patchJson('/api/admin/sms/types/customer_order_ready', ['dv_templates' => ['customer_order_ready_delivery' => 'ޕެކްކުރެވިއްޖެ']])
            ->assertOk()->assertJsonPath('dv_templates.customer_order_ready_delivery', 'ޕެކްކުރެވިއްޖެ');
        $this->assertSame('ޕެކްކުރެވިއްޖެ', SmsTemplate::where('slug', 'customer_order_ready_delivery')->value('body_dv'));

        $this->patchJson('/api/admin/sms/types/customer_order_ready', ['dv_templates' => ['customer_order_ready_delivery' => '']])->assertOk();
        $this->assertNull(SmsTemplate::where('slug', 'customer_order_ready_delivery')->value('body_dv'));

        $this->patchJson('/api/admin/sms/types/owner_day_report', ['dv_templates' => ['owner_day_report' => 'x']])->assertStatus(422);
    }

    public function test_emails_follow_the_customers_language_and_read_right_to_left(): void
    {
        $this->dhivehi(true);
        Customer::factory()->create(['phone' => '+9607771111', 'email' => 'aisha@example.test', 'preferred_language' => 'dv']);

        $this->assertSame('dv', CustomerSmsText::languageFor(null, 'AISHA@example.test'));
        $this->assertSame('en', CustomerSmsText::languageFor('7779999', 'someone@example.test'));

        $dv = (new CustomerOtpMail('123456', 10, 'login', '7771111'))->locale('dv');
        $html = $dv->render();
        $this->assertStringContainsString('dir="rtl"', $html);
        $this->assertStringContainsString('ތިބާގެ ސައިން އިން ކޯޑު', $html);
        $this->assertStringContainsString('ސައިން އިން ވުމަށް', $html);

        $en = (new CustomerOtpMail('123456', 10, 'login', '7771111'))->render();
        $this->assertStringContainsString('Your sign-in code', $en);
        $this->assertStringContainsString('dir="ltr"', $en);
    }
}
