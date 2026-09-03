<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The supplier's barcode on a stock item, for receiving by scan. Owner, 2026-09-02. */
class InventoryBarcodeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        Sanctum::actingAs(User::create([
            'name' => 'Boss', 'email' => 'boss@test.local', 'password' => Hash::make('password'),
            'role_id' => $role->id, 'is_active' => true,
        ]), ['staff']);
    }

    public function test_a_stock_item_keeps_its_barcode_and_it_is_unique(): void
    {
        $this->postJson('/api/inventory', ['name' => 'Flour 25kg', 'unit' => 'kg', 'barcode' => '8801234567890'])
            ->assertCreated();
        $this->assertSame('8801234567890', InventoryItem::where('name', 'Flour 25kg')->value('barcode'));

        $this->postJson('/api/inventory', ['name' => 'Other flour', 'unit' => 'kg', 'barcode' => '8801234567890'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['barcode']);

        $id = (int) InventoryItem::where('name', 'Flour 25kg')->value('id');
        $this->patchJson("/api/inventory/{$id}", ['barcode' => '5550001'])->assertOk();
        $this->assertSame('5550001', InventoryItem::find($id)?->barcode);
    }
}
