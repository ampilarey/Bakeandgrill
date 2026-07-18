<?php

declare(strict_types=1);

namespace Tests\Feature\GiftCard;

use App\Domains\Payments\Services\GiftCardCodeService;
use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GiftCardEnhancementsTest extends TestCase
{
    use RefreshDatabase;

    private array $adminHeaders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminHeaders = $this->staffHeaders($this->makeOwner());
    }

    public function test_code_normalization_accepts_codes_without_hyphens(): void
    {
        $svc = app(GiftCardCodeService::class);
        $generated = $svc->generate();

        GiftCard::create([
            'code_hash' => $generated['hash'],
            'code_last4' => $generated['last4'],
            'initial_balance' => 50,
            'current_balance' => 50,
            'status' => 'active',
        ]);

        $plainNoHyphens = str_replace('-', '', $generated['plain']);

        $this->postJson('/api/gift-cards/balance', ['code' => $plainNoHyphens])
            ->assertOk()
            ->assertJsonPath('current_balance', 50);
    }

    public function test_admin_index_filters_by_status_and_returns_created_at(): void
    {
        GiftCard::create([
            'code_hash' => hash('sha256', 'active-card'),
            'code_last4' => 'ACTV',
            'initial_balance' => 20,
            'current_balance' => 20,
            'status' => 'active',
        ]);
        GiftCard::create([
            'code_hash' => hash('sha256', 'depleted-card'),
            'code_last4' => 'DPLD',
            'initial_balance' => 20,
            'current_balance' => 0,
            'status' => 'depleted',
        ]);

        $this->getJson('/api/admin/gift-cards?status=active', $this->adminHeaders)
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.status', 'active')
            ->assertJsonStructure(['data' => [['created_at', 'masked_code']]]);
    }

    public function test_admin_can_cancel_active_card(): void
    {
        $card = GiftCard::create([
            'code_hash' => hash('sha256', 'cancel-me'),
            'code_last4' => 'CNCL',
            'initial_balance' => 30,
            'current_balance' => 30,
            'status' => 'active',
        ]);

        $this->postJson("/api/admin/gift-cards/{$card->id}/cancel", [], $this->adminHeaders)
            ->assertOk()
            ->assertJsonPath('gift_card.status', 'cancelled');

        $this->assertSame('cancelled', $card->fresh()->status);
    }

    public function test_admin_transactions_ledger(): void
    {
        $card = GiftCard::create([
            'code_hash' => hash('sha256', 'ledger-card'),
            'code_last4' => 'LDGR',
            'initial_balance' => 40,
            'current_balance' => 40,
            'status' => 'active',
        ]);
        GiftCardTransaction::create([
            'gift_card_id' => $card->id,
            'amount' => 40,
            'type' => 'load',
            'balance_after' => 40,
        ]);

        $this->getJson("/api/admin/gift-cards/{$card->id}/transactions", $this->adminHeaders)
            ->assertOk()
            ->assertJsonPath('transactions.0.type', 'load')
            ->assertJsonPath('gift_card.masked_code', $card->masked_code);
    }

    public function test_issue_with_send_sms_logs_transactional_message(): void
    {
        $res = $this->postJson('/api/admin/gift-cards', [
            'amount' => 75,
            'send_sms' => true,
            'recipient_phone' => '+9607890123',
            'sms_note' => 'Happy birthday!',
        ], $this->adminHeaders);

        $res->assertCreated()
            ->assertJsonPath('sms.ok', true)
            ->assertJsonPath('sms.phone', '+9607890123');

        $code = $res->json('gift_card.code');
        $this->assertNotEmpty($code);

        $this->assertDatabaseHas('sms_logs', [
            'reference_type' => 'gift_card',
            'to' => '+9607890123',
            'type' => 'transactional',
        ]);

        $body = SmsLog::query()->where('reference_type', 'gift_card')->latest('id')->value('message');
        $this->assertStringContainsString($code, (string) $body);
        $this->assertStringContainsString('MVR 75.00', (string) $body);
        $this->assertStringContainsString('Happy birthday!', (string) $body);
    }

    public function test_issue_send_sms_uses_customer_phone_when_recipient_omitted(): void
    {
        $customer = $this->makeCustomer(['phone' => '+9607777001']);

        $this->postJson('/api/admin/gift-cards', [
            'amount' => 40,
            'customer_id' => $customer->id,
            'send_sms' => true,
        ], $this->adminHeaders)
            ->assertCreated()
            ->assertJsonPath('sms.ok', true)
            ->assertJsonPath('sms.phone', '+9607777001');

        $this->assertDatabaseHas('sms_logs', [
            'reference_type' => 'gift_card',
            'to' => '+9607777001',
        ]);
    }

    public function test_send_sms_endpoint_requires_plaintext_code(): void
    {
        $svc = app(GiftCardCodeService::class);
        $generated = $svc->generate();

        GiftCard::create([
            'code_hash' => $generated['hash'],
            'code_last4' => $generated['last4'],
            'initial_balance' => 50,
            'current_balance' => 50,
            'status' => 'active',
        ]);

        $this->postJson('/api/admin/gift-cards/send-sms', [
            'code' => $generated['plain'],
            'recipient_phone' => '+9607890456',
        ], $this->adminHeaders)
            ->assertOk()
            ->assertJsonPath('sms.ok', true);

        $this->assertDatabaseHas('sms_logs', [
            'reference_type' => 'gift_card',
            'to' => '+9607890456',
        ]);
    }
}
