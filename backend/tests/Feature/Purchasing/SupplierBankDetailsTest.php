<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-08: "add supplier acc number option."
 *
 * Kept with the bank and the name on the account, because the number alone
 * does not pay anybody here: two banks issue account numbers, and a shop's
 * account is often in the shopkeeper's own name.
 */
class SupplierBankDetailsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    public function test_an_account_can_be_recorded_when_the_supplier_is_created(): void
    {
        $res = $this->postJson('/api/suppliers', [
            'name' => 'The Royal Bakery',
            'bank_name' => 'BML',
            'bank_account_name' => 'Ahmed Hassan',
            'bank_account_number' => '7730000123456',
        ])->assertCreated()->json('supplier');

        $this->assertSame('BML', $res['bank_name']);
        $this->assertSame('Ahmed Hassan', $res['bank_account_name']);
        $this->assertSame('7730000123456', $res['bank_account_number']);
    }

    public function test_it_comes_back_on_the_list_so_somebody_can_pay_from_it(): void
    {
        Supplier::create([
            'name' => 'Bazaaru', 'is_active' => true,
            'bank_name' => 'MIB', 'bank_account_name' => 'Bazaaru Pvt Ltd',
            'bank_account_number' => '9001 2345 6789',
        ]);

        $row = collect($this->getJson('/api/suppliers')->assertOk()->json('suppliers.data'))
            ->firstWhere('name', 'Bazaaru');

        $this->assertSame('9001 2345 6789', $row['bank_account_number']);
        $this->assertSame('MIB', $row['bank_name']);
    }

    public function test_an_account_that_changed_hands_can_be_cleared(): void
    {
        $s = Supplier::create([
            'name' => 'Frez', 'is_active' => true,
            'bank_name' => 'BML', 'bank_account_number' => '7730000999999',
        ]);

        $this->patchJson("/api/suppliers/{$s->id}", [
            'bank_name' => '', 'bank_account_name' => '', 'bank_account_number' => '',
        ])->assertOk();

        $s->refresh();
        $this->assertEmpty($s->bank_account_number);
        $this->assertEmpty($s->bank_name);
    }

    public function test_it_refuses_something_that_is_not_an_account_number(): void
    {
        // A pasted sentence, a name, an IBAN with letters — none of these are
        // going to reach anybody's account, and finding out at the bank is
        // worse than finding out here.
        $this->postJson('/api/suppliers', [
            'name' => 'Taza', 'bank_account_number' => 'ask Ahmed for it',
        ])->assertStatus(422)->assertJsonValidationErrors(['bank_account_number']);
    }

    public function test_spaces_and_dashes_are_kept_as_they_were_written(): void
    {
        // People copy an account off a card or a WhatsApp message; re-typing
        // it to satisfy a format is how a digit gets lost.
        $res = $this->postJson('/api/suppliers', [
            'name' => 'Raqeeb', 'bank_account_number' => '7730-0001-2345-6',
        ])->assertCreated()->json('supplier');

        $this->assertSame('7730-0001-2345-6', $res['bank_account_number']);
    }

    public function test_a_supplier_paid_in_cash_needs_none_of_it(): void
    {
        $id = $this->postJson('/api/suppliers', ['name' => 'Corner shop'])
            ->assertCreated()->json('supplier.id');

        // Read back rather than off the create response: Eloquent returns
        // only the attributes it was given, so a column never set is absent
        // there rather than null.
        $shop = Supplier::findOrFail($id);
        $this->assertNull($shop->bank_account_number);
        $this->assertNull($shop->bank_name);
        $this->assertNull($shop->bank_account_name);
    }
}
