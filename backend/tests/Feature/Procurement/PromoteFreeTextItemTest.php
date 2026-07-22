<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PromoteFreeTextItemTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $this->manager = $this->makeManager(['email' => 'mgr-promote@pr.test']);
        $this->cashier = $this->makeStaff('staff', ['email' => 'cashier-promote@pr.test']);
    }

    private function createFreeTextRequest(): array
    {
        Sanctum::actingAs($this->cashier, ['staff']);

        $response = $this->postJson('/api/purchase-requests', [
            'source' => 'pos',
            'priority' => 'normal',
            'items' => [[
                'free_text_name' => 'Specialty sesame oil',
                'requested_qty' => 2,
                'requested_unit' => 'bottle',
                'reason' => 'other',
            ]],
        ]);

        $response->assertCreated();

        $prId = (int) $response->json('request.id');
        $itemId = (int) PurchaseRequest::findOrFail($prId)->items()->first()->id;

        return [$prId, $itemId];
    }

    public function test_promotes_free_text_line_to_new_inventory_item(): void
    {
        [$prId, $itemId] = $this->createFreeTextRequest();

        Sanctum::actingAs($this->manager, ['staff']);
        $response = $this->postJson("/api/purchase-requests/{$prId}/items/{$itemId}/promote-to-inventory", [
            'unit' => 'bottle',
            'reorder_point' => 3,
            'reorder_quantity' => 6,
        ]);

        $response->assertOk()
            ->assertJsonPath('created', true)
            ->assertJsonPath('inventory_item.name', 'Specialty sesame oil')
            ->assertJsonPath('inventory_item.unit', 'bottle')
            ->assertJsonPath('item.inventory_item_id', $response->json('inventory_item.id'))
            ->assertJsonPath('item.free_text_name', 'Specialty sesame oil');

        $this->assertDatabaseHas('inventory_items', [
            'name' => 'Specialty sesame oil',
            'unit' => 'bottle',
            'reorder_point' => 3,
            'reorder_quantity' => 6,
            'is_active' => true,
        ]);

        $this->assertDatabaseHas('purchase_request_items', [
            'id' => $itemId,
            'inventory_item_id' => $response->json('inventory_item.id'),
            'free_text_name' => 'Specialty sesame oil',
        ]);

        $this->assertTrue(
            AuditLog::query()
                ->where('action', 'purchase_request.promoted_to_inventory')
                ->where('model_type', 'PurchaseRequestItem')
                ->where('model_id', $itemId)
                ->exists(),
        );
    }

    public function test_promote_is_idempotent_on_duplicate_name(): void
    {
        $existing = InventoryItem::create([
            'name' => 'Specialty sesame oil',
            'unit' => 'L',
            'current_stock' => 1,
            'is_active' => true,
        ]);

        [$prId, $itemId] = $this->createFreeTextRequest();

        Sanctum::actingAs($this->manager, ['staff']);
        $response = $this->postJson("/api/purchase-requests/{$prId}/items/{$itemId}/promote-to-inventory", [
            'unit' => 'bottle',
        ]);

        $response->assertOk()
            ->assertJsonPath('created', false)
            ->assertJsonPath('inventory_item.id', $existing->id)
            ->assertJsonPath('item.inventory_item_id', $existing->id);

        $this->assertSame(1, InventoryItem::whereRaw('LOWER(name) = ?', ['specialty sesame oil'])->count());
    }

    public function test_promote_returns_existing_when_line_already_linked(): void
    {
        $existing = InventoryItem::create([
            'name' => 'Linked oil',
            'unit' => 'bottle',
            'current_stock' => 0,
            'is_active' => true,
        ]);

        Sanctum::actingAs($this->cashier, ['staff']);
        $prId = $this->postJson('/api/purchase-requests', [
            'source' => 'pos',
            'items' => [[
                'free_text_name' => 'Linked oil',
                'inventory_item_id' => $existing->id,
                'requested_qty' => 1,
                'requested_unit' => 'bottle',
            ]],
        ])->json('request.id');
        $itemId = PurchaseRequest::findOrFail($prId)->items()->first()->id;

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$prId}/items/{$itemId}/promote-to-inventory")
            ->assertOk()
            ->assertJsonPath('created', false)
            ->assertJsonPath('inventory_item.id', $existing->id);

        $this->assertSame(1, InventoryItem::where('name', 'Linked oil')->count());
    }

    public function test_staff_without_inventory_manage_cannot_promote(): void
    {
        [$prId, $itemId] = $this->createFreeTextRequest();

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/purchase-requests/{$prId}/items/{$itemId}/promote-to-inventory", [
            'unit' => 'bottle',
        ])->assertForbidden();
    }
}
