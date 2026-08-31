<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Category;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The POS menu feed must carry each item's tax_code. It only sent the
 * legacy tax_rate, so the POS treated every line as standard-rated and
 * previewed GST on exempt/zero-rated items — the server always billed
 * correctly from the DB, but the cashier quoted the wrong total.
 */
class PosMenuTaxCodeTest extends TestCase
{
    use RefreshDatabase;

    public function test_pos_menu_items_carry_their_tax_code(): void
    {
        $category = Category::create(['name' => 'Tax Food', 'slug' => 'tax-food', 'is_active' => true]);
        $standard = Item::create([
            'category_id' => $category->id,
            'name' => 'Standard Item',
            'base_price' => 10.0,
            'sku' => 'TAX-STD',
            'is_active' => true,
            'is_available' => true,
            'tax_code' => 'standard_8',
        ]);
        $exempt = Item::create([
            'category_id' => $category->id,
            'name' => 'Exempt Item',
            'base_price' => 10.0,
            'sku' => 'TAX-EXEMPT',
            'is_active' => true,
            'is_available' => true,
            'tax_code' => 'exempt',
        ]);

        Sanctum::actingAs($this->makeStaff(), ['staff']);
        $items = collect($this->getJson('/api/pos/menu?channel=takeaway')->assertOk()->json('items'));

        $this->assertSame('standard_8', $items->firstWhere('id', $standard->id)['tax_code'] ?? null);
        $this->assertSame(
            'exempt',
            $items->firstWhere('id', $exempt->id)['tax_code'] ?? null,
            'an exempt item must arrive tax-coded so the POS previews MVR 0.00 GST for it',
        );
    }
}
