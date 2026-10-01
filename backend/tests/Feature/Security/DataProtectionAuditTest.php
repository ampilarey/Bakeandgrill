<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\SmsLog;
use App\Support\CsvCell;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Security and data protection audit, 2026-10-01.
 */
class DataProtectionAuditTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    public function test_a_gift_card_text_is_logged_without_its_code_or_view_link(): void
    {
        app(SmsService::class)->send(new SmsMessage(
            to: '7771234',
            message: "Bake & Grill gift card MVR 200.\nCode: ABCD-EFGH-JKMN-WXYZ\nView: https://bakeandgrill.mv/order/gift-cards/v/" . str_repeat('a1B2', 10),
            type: 'giftcard_delivery',
        ));

        $logged = (string) SmsLog::latest('id')->value('message');
        $this->assertStringNotContainsString('ABCD-EFGH-JKMN', $logged);
        $this->assertStringContainsString('****-****-****-WXYZ', $logged);
        $this->assertStringNotContainsString('a1B2a1B2', $logged);
    }

    public function test_csv_cells_never_start_a_formula(): void
    {
        $this->assertSame("'=HYPERLINK(\"x\")", CsvCell::safe('=HYPERLINK("x")'));
        $this->assertSame("'@SUM(A1)", CsvCell::safe('@SUM(A1)'));
        $this->assertSame('-12.50', CsvCell::safe('-12.50'), 'a negative amount is still a number');
        $this->assertSame('Aisha', CsvCell::safe('Aisha'));
    }

    public function test_an_owner_can_erase_a_customer_and_the_record_keeps_nothing_personal(): void
    {
        $customer = $this->makeCustomer(['name' => 'Aisha Ahmed', 'phone' => '7712345', 'email' => 'aisha@example.com']);
        CustomerAddress::create(['customer_id' => $customer->id, 'label' => 'Home', 'address_line1' => 'Maaveyo Magu 12', 'island' => 'Male', 'contact_name' => 'Aisha', 'contact_phone' => '7712345']);
        $order = $this->makePaidOrder($customer, [
            'type' => 'delivery', 'status' => 'completed',
            'delivery_address_line1' => 'Maaveyo Magu 12', 'delivery_contact_name' => 'Aisha', 'delivery_contact_phone' => '7712345',
        ]);
        $customer->createToken('c', ['customer']);

        $this->postJson("/api/admin/customers/{$customer->id}/erase", [], $this->staffHeaders($this->makeOwner()))->assertOk();

        $erased = Customer::withTrashed()->find($customer->id);
        $this->assertSame('Erased customer #' . $customer->id, $erased->name);
        $this->assertNull($erased->email);
        $this->assertNotSame('7712345', $erased->phone);
        $this->assertTrue($erased->trashed());
        $this->assertSame(0, CustomerAddress::where('customer_id', $customer->id)->count());
        $this->assertSame(0, $erased->tokens()->count());

        $order->refresh();
        $this->assertNull($order->delivery_address_line1);
        $this->assertNull($order->delivery_contact_phone);
        $this->assertNotNull($order->total, 'the order itself is kept');

        $log = AuditLog::where('action', 'customer.erased')->firstOrFail();
        $this->assertStringNotContainsString('Aisha', json_encode($log->toArray()));
    }

    public function test_erasure_waits_while_money_or_an_order_is_open_and_is_owner_only(): void
    {
        $customer = $this->makeCustomer();
        $customer->forceFill(['credit_balance_laar' => 5000])->save();
        $owner = $this->staffHeaders($this->makeOwner());

        $this->postJson("/api/admin/customers/{$customer->id}/erase?check=1", [], $owner)
            ->assertOk()
            ->assertJsonPath('blockers.0', 'They owe MVR 50.00 on credit.');
        $this->postJson("/api/admin/customers/{$customer->id}/erase", [], $owner)->assertStatus(422);

        $this->app['auth']->forgetGuards();
        $manager = $this->makeManager();
        $manager->grantPermission('customers.manage');
        $this->postJson("/api/admin/customers/{$customer->id}/erase", [], $this->staffHeaders($manager))->assertForbidden();
    }

    public function test_the_web_server_refuses_scripts_and_pages_under_storage(): void
    {
        $rules = (string) file_get_contents(public_path('.htaccess'));
        $this->assertMatchesRegularExpression('#RewriteRule \^storage/\.\*\\\\\.\(php.*svg.*\)\$ - \[F#', $rules);
    }
}
