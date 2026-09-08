<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-08: "add option to add more than one contact number."
 *
 * A shop is a mobile, a landline and whoever is on the counter today. The
 * main number keeps its meaning — an invoice goes to it, the finance report
 * shows it — and the rest sit beside it.
 */
class SupplierExtraPhonesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    public function test_a_supplier_can_be_reached_on_several_numbers(): void
    {
        $res = $this->postJson('/api/suppliers', [
            'name' => 'Bazaaru',
            'phone' => '7771234',
            'extra_phones' => ['3321234', '9998888'],
        ])->assertCreated()->json('supplier');

        $this->assertSame('7771234', $res['phone']);
        $this->assertSame(['3321234', '9998888'], $res['extra_phones']);

        // The main number is still one number, so everything that sends to it
        // carries on unchanged.
        $this->assertSame(['7771234', '3321234', '9998888'], Supplier::firstWhere('name', 'Bazaaru')->allPhones());
    }

    public function test_empty_rows_from_the_add_another_box_are_dropped(): void
    {
        $s = Supplier::create([
            'name' => 'Frez', 'is_active' => true, 'phone' => '7771234',
            'extra_phones' => ['3321234', '', '   ', null],
        ]);

        $this->assertSame(['3321234'], $s->fresh()->extra_phones);
    }

    public function test_the_main_number_is_not_repeated_underneath_itself(): void
    {
        $s = Supplier::create([
            'name' => 'Taza', 'is_active' => true, 'phone' => '7771234',
            'extra_phones' => ['7771234', '3321234', '3321234'],
        ]);

        // Neither the main number again, nor the same extra twice: a list
        // showing one number twice reads as two ways to reach two people.
        $this->assertSame(['3321234'], $s->fresh()->extra_phones);
    }

    public function test_they_can_all_be_taken_away_again(): void
    {
        $s = Supplier::create([
            'name' => 'Raqeeb', 'is_active' => true, 'phone' => '7771234',
            'extra_phones' => ['3321234'],
        ]);

        $this->patchJson("/api/suppliers/{$s->id}", ['extra_phones' => []])->assertOk();

        $this->assertNull($s->fresh()->extra_phones);
    }

    public function test_a_supplier_with_one_number_is_unchanged(): void
    {
        $id = $this->postJson('/api/suppliers', ['name' => 'Corner shop', 'phone' => '7771234'])
            ->assertCreated()->json('supplier.id');

        $shop = Supplier::findOrFail($id);
        $this->assertNull($shop->extra_phones);
        $this->assertSame(['7771234'], $shop->allPhones());
    }

    public function test_it_refuses_an_unreasonable_number_of_numbers(): void
    {
        $this->postJson('/api/suppliers', [
            'name' => 'Stuck', 'phone' => '7771234',
            'extra_phones' => array_fill(0, 11, '3321234'),
        ])->assertStatus(422)->assertJsonValidationErrors(['extra_phones']);
    }

    public function test_the_extras_come_back_on_the_list(): void
    {
        Supplier::create([
            'name' => 'Island Wholesale', 'is_active' => true, 'phone' => '7771234',
            'extra_phones' => ['3321234'],
        ]);

        $row = collect($this->getJson('/api/suppliers')->assertOk()->json('suppliers.data'))
            ->firstWhere('name', 'Island Wholesale');

        $this->assertSame(['3321234'], $row['extra_phones']);
    }
}
