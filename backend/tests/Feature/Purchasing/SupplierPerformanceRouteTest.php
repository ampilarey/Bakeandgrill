<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-07: the Purchasing → Suppliers page showed "No query results
 * for model [App\Models\Supplier] performance" above the list. The page asks
 * for `/api/suppliers/performance`, and `/api/suppliers/{id}` — registered in
 * the inventory route file, which is required first — matched it and looked
 * for a supplier whose id is the word "performance".
 */
class SupplierPerformanceRouteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    public function test_the_suppliers_page_can_load_the_performance_summary(): void
    {
        Supplier::firstOrCreate(['name' => 'Bazaaru'], ['is_active' => true]);

        $this->getJson('/api/suppliers/performance')
            ->assertOk()
            ->assertJsonStructure(['suppliers']);
    }

    public function test_a_supplier_id_that_is_not_a_number_is_not_a_supplier(): void
    {
        $this->getJson('/api/suppliers/not-an-id')->assertNotFound();
    }

    public function test_one_suppliers_own_page_still_works(): void
    {
        $supplier = Supplier::firstOrCreate(['name' => 'Frez'], ['is_active' => true]);

        $this->getJson("/api/suppliers/{$supplier->id}")
            ->assertOk()
            ->assertJsonPath('supplier.name', 'Frez');
    }
}
