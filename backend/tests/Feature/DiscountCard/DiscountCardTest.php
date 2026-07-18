<?php

declare(strict_types=1);

namespace Tests\Feature\DiscountCard;

use App\Models\Promotion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DiscountCardTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_issue_discount_card_batch(): void
    {
        $headers = $this->staffHeaders($this->makeOwner());

        $res = $this->postJson('/api/admin/discount-cards/batches', [
            'name' => 'Staff 10% cards',
            'type' => 'percentage',
            'discount_value' => 10,
            'quantity' => 3,
            'expires_at' => now()->addMonth()->toDateString(),
            'max_uses_per_card' => 1,
            'min_order_laar' => 5000,
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('batch.quantity', 3)
            ->assertJsonPath('batch.type', 'percentage');

        $this->assertCount(3, $res->json('cards'));
        $this->assertStringStartsWith('DC-', $res->json('cards.0.code'));

        $this->assertDatabaseCount('discount_card_batches', 1);
        $this->assertSame(3, Promotion::query()->where('metadata->kind', 'discount_card')->count());
    }

    public function test_manager_cannot_issue_discount_cards(): void
    {
        $manager = $this->makeManager();
        $headers = $this->staffHeaders($manager);

        $this->postJson('/api/admin/discount-cards/batches', [
            'name' => 'Nope',
            'type' => 'percentage',
            'discount_value' => 10,
            'quantity' => 1,
        ], $headers)->assertForbidden();
    }

    public function test_discount_card_applies_via_promo_path(): void
    {
        $ownerHeaders = $this->staffHeaders($this->makeOwner());
        $issue = $this->postJson('/api/admin/discount-cards/batches', [
            'name' => 'MVR 20 off',
            'type' => 'fixed',
            'discount_value' => 2000,
            'quantity' => 1,
        ], $ownerHeaders)->assertCreated();

        $code = $issue->json('cards.0.code');

        $this->postJson('/api/promotions/validate', ['code' => $code])
            ->assertOk()
            ->assertJsonPath('valid', true);
    }

    public function test_void_deactivates_card(): void
    {
        $headers = $this->staffHeaders($this->makeOwner());
        $issue = $this->postJson('/api/admin/discount-cards/batches', [
            'name' => 'Void me',
            'type' => 'percentage',
            'discount_value' => 15,
            'quantity' => 1,
        ], $headers)->assertCreated();

        $id = (int) $issue->json('cards.0.id');
        $this->postJson("/api/admin/discount-cards/{$id}/void", [], $headers)
            ->assertOk();

        $promo = Promotion::withTrashed()->find($id);
        $this->assertNotNull($promo?->deleted_at);
        $this->assertFalse((bool) $promo->is_active);
    }

    public function test_discount_cards_hidden_from_promotions_list(): void
    {
        $headers = $this->staffHeaders($this->makeOwner());
        $this->postJson('/api/admin/discount-cards/batches', [
            'name' => 'Hidden',
            'type' => 'percentage',
            'discount_value' => 5,
            'quantity' => 1,
        ], $headers)->assertCreated();

        Promotion::create([
            'name' => 'Campaign',
            'code' => 'WELCOME10',
            'type' => 'percentage',
            'discount_value' => 10,
            'is_active' => true,
            'scope' => 'order',
        ]);

        $list = $this->getJson('/api/admin/promotions', $headers)->assertOk();
        $codes = collect($list->json('data'))->pluck('code')->all();
        $this->assertContains('WELCOME10', $codes);
        $this->assertFalse(
            collect($codes)->contains(fn ($c) => is_string($c) && str_starts_with($c, 'DC-')),
        );
    }

    public function test_rejects_invalid_percentage(): void
    {
        $headers = $this->staffHeaders($this->makeOwner());
        $this->postJson('/api/admin/discount-cards/batches', [
            'name' => 'Bad',
            'type' => 'percentage',
            'discount_value' => 150,
            'quantity' => 1,
        ], $headers)->assertStatus(422);
    }
}
