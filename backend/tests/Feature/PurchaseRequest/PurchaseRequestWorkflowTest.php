<?php

declare(strict_types=1);

namespace Tests\Feature\PurchaseRequest;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PurchaseRequestWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private User $kitchen;

    private User $manager;

    private InventoryItem $inventoryItem;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $this->cashier = $this->makeStaff('staff', ['email' => 'cashier@pr.test']);
        $this->kitchen = $this->makeKitchenStaff(['email' => 'kitchen@pr.test']);
        $this->manager = $this->makeManager(['email' => 'manager@pr.test']);

        ExpenseCategory::create(['name' => 'Supplies', 'slug' => 'supplies', 'icon' => '📦']);

        $this->inventoryItem = InventoryItem::create([
            'name' => 'Flour',
            'sku' => 'FLR-001',
            'unit' => 'kg',
            'current_stock' => 10,
            'unit_cost' => 5.0,
            'is_active' => true,
        ]);
    }

    private function createPayload(array $overrides = []): array
    {
        return array_merge([
            'source' => 'pos',
            'priority' => 'normal',
            'items' => [[
                'free_text_name' => 'Flour bag',
                'inventory_item_id' => $this->inventoryItem->id,
                'requested_qty' => 2,
                'requested_unit' => 'kg',
                'reason' => 'low_stock',
            ]],
        ], $overrides);
    }

    public function test_cashier_can_create_purchase_request(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);

        $response = $this->postJson('/api/purchase-requests', $this->createPayload());
        $response->assertCreated()
            ->assertJsonPath('request.status', 'requested')
            ->assertJsonPath('request.source', 'pos');

        $this->assertDatabaseHas('purchase_requests', ['requested_by' => $this->cashier->id, 'status' => 'requested']);
    }

    public function test_kitchen_staff_can_create_purchase_request(): void
    {
        Sanctum::actingAs($this->kitchen, ['staff']);

        $response = $this->postJson('/api/purchase-requests', $this->createPayload(['source' => 'kds']));
        $response->assertCreated()->assertJsonPath('request.source', 'kds');
    }

    public function test_staff_can_view_own_request_but_not_all(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $id = $this->postJson('/api/purchase-requests', $this->createPayload())->json('request.id');

        $this->getJson('/api/purchase-requests/my')->assertOk()
            ->assertJsonPath('data.0.id', $id);

        $this->getJson('/api/purchase-requests')->assertForbidden();
    }

    public function test_manager_can_approve_and_assign(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $id = $this->postJson('/api/purchase-requests', $this->createPayload())->json('request.id');

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/approve")->assertOk()
            ->assertJsonPath('request.status', 'approved');

        $this->postJson("/api/purchase-requests/{$id}/assign", ['assigned_to' => $this->cashier->id])
            ->assertOk()
            ->assertJsonPath('request.status', 'assigned');
    }

    public function test_assigned_staff_can_mark_bought_without_stock_change(): void
    {
        $id = $this->createAssignedRequest();
        $itemId = PurchaseRequest::find($id)->items()->first()->id;
        $stockBefore = (float) $this->inventoryItem->fresh()->current_stock;
        $expensesBefore = Expense::count();

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/mark-bought", [
            'actual_qty' => 2,
            'actual_unit_cost_laar' => 500,
            'supplier_name_text' => 'Local shop',
        ])->assertOk();

        $this->assertSame($stockBefore, (float) $this->inventoryItem->fresh()->current_stock);
        $this->assertSame($expensesBefore, Expense::count());
        $this->assertSame(0, StockMovement::where('reference_type', 'purchase_request')->count());
        $this->assertDatabaseHas('purchase_requests', ['id' => $id, 'status' => 'bought_pending_verification']);
    }

    public function test_unassigned_staff_cannot_mark_bought(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $id = $this->postJson('/api/purchase-requests', $this->createPayload())->json('request.id');
        $itemId = PurchaseRequest::find($id)->items()->first()->id;

        Sanctum::actingAs($this->kitchen, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/mark-bought", ['actual_qty' => 1])
            ->assertStatus(422);
    }

    public function test_manager_verify_updates_stock(): void
    {
        $id = $this->createBoughtRequest();
        $itemId = PurchaseRequest::find($id)->items()->first()->id;

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/verify-received")
            ->assertOk();

        $this->assertSame(12.0, (float) $this->inventoryItem->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', [
            'inventory_item_id' => $this->inventoryItem->id,
            'reference_type' => 'purchase_request',
            'reference_id' => $id,
        ]);
    }

    public function test_kitchen_cannot_approve_or_verify(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $id = $this->postJson('/api/purchase-requests', $this->createPayload())->json('request.id');

        Sanctum::actingAs($this->kitchen, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/approve")->assertForbidden();
        $this->getJson('/api/reports/finance/gst/output-statement?period=2026-05')->assertForbidden();
    }

    public function test_cashier_cannot_approve_own_request(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $id = $this->postJson('/api/purchase-requests', $this->createPayload())->json('request.id');

        $this->postJson("/api/purchase-requests/{$id}/approve")->assertForbidden();
    }

    public function test_rejected_request_cannot_be_bought(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $id = $this->postJson('/api/purchase-requests', $this->createPayload())->json('request.id');
        $itemId = PurchaseRequest::find($id)->items()->first()->id;

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/reject", ['reason' => 'Not needed'])->assertOk();

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/mark-bought", ['actual_qty' => 1])
            ->assertStatus(422);
    }

    public function test_partial_and_not_available_paths(): void
    {
        $id = $this->createAssignedRequest();
        $itemId = PurchaseRequest::find($id)->items()->first()->id;

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/mark-partial", [
            'actual_qty' => 1,
        ])->assertOk()->assertJsonPath('item.status', 'partially_bought');

        $this->postJson('/api/purchase-requests', $this->createPayload([
            'items' => [['free_text_name' => 'Gas', 'requested_qty' => 1, 'requested_unit' => 'tank', 'reason' => 'gas']],
        ]));
        $id2 = PurchaseRequest::latest('id')->first()->id;
        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id2}/approve")->assertOk();
        $this->postJson("/api/purchase-requests/{$id2}/assign", ['assigned_to' => $this->cashier->id])->assertOk();
        $item2 = PurchaseRequest::find($id2)->items()->first()->id;

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/purchase-requests/{$id2}/items/{$item2}/mark-not-available", ['buyer_notes' => 'Out of stock'])
            ->assertOk()->assertJsonPath('item.status', 'not_available');
    }

    public function test_attachment_upload_works(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->cashier, ['staff']);
        $id = $this->postJson('/api/purchase-requests', $this->createPayload())->json('request.id');

        $file = UploadedFile::fake()->image('receipt.jpg');
        $this->postJson("/api/purchase-requests/{$id}/attachments", [
            'file' => $file,
            'type' => 'request_photo',
        ])->assertCreated();

        $this->assertDatabaseHas('purchase_request_attachments', [
            'purchase_request_id' => $id,
            'type' => 'request_photo',
        ]);
    }

    public function test_audit_log_created_on_create(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson('/api/purchase-requests', $this->createPayload())->assertCreated();

        $this->assertTrue(AuditLog::where('action', 'purchase_request.created')->exists());
    }

    public function test_convert_to_expense_creates_pending_expense(): void
    {
        $id = $this->createBoughtRequest();
        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/convert-to-expense")->assertOk();

        $this->assertDatabaseHas('expenses', ['status' => 'pending']);
        $this->assertNotNull(PurchaseRequest::find($id)->expense_id);
    }

    private function createAssignedRequest(): int
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $id = $this->postJson('/api/purchase-requests', $this->createPayload())->json('request.id');

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/approve")->assertOk();
        $this->postJson("/api/purchase-requests/{$id}/assign", ['assigned_to' => $this->cashier->id])->assertOk();

        return (int) $id;
    }

    private function createBoughtRequest(): int
    {
        $id = $this->createAssignedRequest();
        $itemId = PurchaseRequest::find($id)->items()->first()->id;

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/purchase-requests/{$id}/items/{$itemId}/mark-bought", [
            'actual_qty' => 2,
            'actual_unit_cost_laar' => 500,
        ])->assertOk();

        return $id;
    }
}
