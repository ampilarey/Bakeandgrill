<?php

declare(strict_types=1);

namespace Tests\Feature\Credit;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\SmsTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-03: "add account approved, and any changes to the credit
 * amount notified." The customer gets a text when the account is opened or
 * reopened, and whenever the limit goes up or down. Each has its own switch.
 */
class CreditAccountSmsTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{to: string, type: string, message: string}> */
    private array $sent = [];

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607778888', 'is_active' => true]);

        $sms = $this->createMock(SmsService::class);
        $sms->method('send')->willReturnCallback(function (SmsMessage $msg) {
            $this->sent[] = ['to' => $msg->to, 'type' => $msg->type, 'message' => $msg->message];
            $log = new SmsLog;
            $log->status = 'demo';

            return $log;
        });
        $this->app->instance(SmsService::class, $sms);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function credit(array $body): void
    {
        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", $body)->assertOk();
    }

    /** @return list<array{to: string, type: string, message: string}> */
    private function take(): array
    {
        $out = $this->sent;
        $this->sent = [];

        return $out;
    }

    public function test_approval_texts_the_customer_their_limit_and_terms(): void
    {
        $this->credit(['action' => 'approve', 'credit_limit_mvr' => 1500, 'credit_payment_terms_days' => 14]);

        $sent = $this->take();
        $this->assertCount(1, $sent);
        $this->assertSame('customer_credit_approved', $sent[0]['type']);
        $this->assertSame('+9607778888', $sent[0]['to']);
        $this->assertStringContainsString('credit account is approved', $sent[0]['message']);
        $this->assertStringContainsString('MVR 1,500.00', $sent[0]['message']);
        $this->assertStringContainsString('14 days', $sent[0]['message']);
    }

    public function test_every_limit_change_is_texted_up_or_down_and_an_unchanged_one_is_not(): void
    {
        $this->credit(['action' => 'approve', 'credit_limit_mvr' => 500]);
        $this->take();

        $this->credit(['action' => 'update_limit', 'credit_limit_mvr' => 800, 'reason' => 'Regular, pays on time']);
        $up = $this->take();
        $this->assertCount(1, $up);
        $this->assertSame('customer_credit_limit_changed', $up[0]['type']);
        $this->assertStringContainsString('increased from MVR 500.00 to MVR 800.00', $up[0]['message']);
        $this->assertStringContainsString('Available now: MVR 800.00', $up[0]['message']);

        $this->credit(['action' => 'update_limit', 'credit_limit_mvr' => 300, 'reason' => 'Bringing it down']);
        $this->assertStringContainsString('reduced from MVR 800.00 to MVR 300.00', $this->take()[0]['message']);

        // Re-approving an open account with a new limit is a limit change, not a second "approved".
        $this->credit(['action' => 'approve', 'credit_limit_mvr' => 400]);
        $again = $this->take();
        $this->assertSame(['customer_credit_limit_changed'], array_column($again, 'type'));

        // Same limit: nothing to say.
        $this->credit(['action' => 'update_limit', 'credit_limit_mvr' => 400, 'reason' => 'No change really']);
        $this->assertSame([], $this->take());
    }

    public function test_reopening_a_blocked_account_says_approved_and_a_blocked_account_hears_no_limit_change(): void
    {
        $this->credit(['action' => 'approve', 'credit_limit_mvr' => 500]);
        $this->credit(['action' => 'set_status', 'credit_status' => 'blocked']);
        $this->take();

        $this->credit(['action' => 'update_limit', 'credit_limit_mvr' => 900, 'reason' => 'While it is blocked']);
        $this->assertSame([], $this->take(), 'a blocked account is not told its limit moved');

        $this->credit(['action' => 'set_status', 'credit_status' => 'active']);
        $reopened = $this->take();
        $this->assertSame(['customer_credit_approved'], array_column($reopened, 'type'));
        $this->assertStringContainsString('MVR 900.00', $reopened[0]['message']);
    }

    public function test_the_wording_is_an_editable_template_and_each_text_has_its_own_switch(): void
    {
        SmsTemplate::where('slug', 'customer_credit_approved')->update(['body' => 'Welcome! Your credit: MVR {{limit}}.']);
        $this->credit(['action' => 'approve', 'credit_limit_mvr' => 250]);
        $this->assertSame('Welcome! Your credit: MVR 250.00.', $this->take()[0]['message']);

        foreach (['customer_credit_approved' => 'sms_customer_credit_approved_enabled', 'customer_credit_limit_changed' => 'sms_customer_credit_limit_changed_enabled'] as $type => $setting) {
            $entry = SmsTypeRegistry::resolve($type);
            $this->assertNotNull($entry, "{$type} is in the SMS Control Center");
            $this->assertSame($setting, $entry['enabled_setting']);
            $this->assertTrue(SmsTypeRegistry::isTypeEnabled($entry), 'on by default');
            SiteSetting::set($setting, '0');
            \Illuminate\Support\Facades\Cache::flush();
            $this->assertFalse(SmsTypeRegistry::isTypeEnabled(SmsTypeRegistry::resolve($type)), 'the owner can turn it off');
        }
    }

    public function test_no_phone_means_no_text_and_the_approval_still_stands(): void
    {
        // The phone column is required, so a blank one stands in for "no phone".
        \Illuminate\Support\Facades\DB::table('customers')->where('id', $this->customer->id)->update(['phone' => '']);
        $this->credit(['action' => 'approve', 'credit_limit_mvr' => 500]);
        $this->assertSame([], $this->take());
        $this->assertTrue((bool) $this->customer->fresh()->credit_enabled);
    }
}
