<?php

declare(strict_types=1);

namespace Tests\Feature\GiftCard;

use App\Domains\Payments\Services\GiftCardCodeService;
use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
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
}
