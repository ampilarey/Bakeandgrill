<?php

declare(strict_types=1);

namespace Tests\Unit\Trade;

use App\Domains\Trade\Services\TradePriceResolver;
use App\Models\Category;
use App\Models\Customer;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\Promotion;
use App\Models\TradeAccount;
use App\Models\TradePriceListEntry;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TradePriceResolverTest extends TestCase
{
    use RefreshDatabase;

    private TradePriceResolver $resolver;

    private TradeAccount $account;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = app(TradePriceResolver::class);

        $customer = Customer::create([
            'name' => 'Shop Co',
            'phone' => '+9607001001',
            'is_active' => true,
            'credit_payment_terms_days' => 30,
        ]);

        $this->account = TradeAccount::create([
            'customer_id' => $customer->id,
            'shop_name' => 'Island Mart',
            'settlement_mode' => 'sale_or_return',
            'billing_cycle' => 'monthly',
            'missing_policy' => 'charge',
            'default_discount_bp' => 1000, // 10%
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Momo', 'slug' => 'momo', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Momo set',
            'base_price' => 100.00, // MVR → 10000 laari
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    #[Test]
    public function account_price_list_wins_when_present(): void
    {
        TradePriceListEntry::create([
            'trade_account_id' => $this->account->id,
            'item_id' => $this->item->id,
            'variant_id' => null,
            'price_laar' => 7500,
            'is_active' => true,
        ]);
        $this->item->update(['wholesale_price_laar' => 8000]);

        $result = $this->resolver->resolve($this->account, $this->item);

        $this->assertTrue($result->found);
        $this->assertSame(7500, $result->priceLaar);
        $this->assertSame('account_list', $result->source);
    }

    #[Test]
    public function falls_back_to_item_wholesale_price_laar(): void
    {
        $this->item->update(['wholesale_price_laar' => 8200]);

        $result = $this->resolver->resolve($this->account, $this->item);

        $this->assertTrue($result->found);
        $this->assertSame(8200, $result->priceLaar);
        $this->assertSame('item_wholesale', $result->source);
    }

    #[Test]
    public function falls_back_to_retail_minus_default_discount_bp(): void
    {
        // 100.00 MVR = 10000 laari; 10% off → 9000
        $result = $this->resolver->resolve($this->account, $this->item);

        $this->assertTrue($result->found);
        $this->assertSame(9000, $result->priceLaar);
        $this->assertSame('retail_discount', $result->source);
    }

    #[Test]
    public function returns_no_price_when_nothing_available(): void
    {
        $this->account->update(['default_discount_bp' => null]);
        // base_price 0 with no wholesale and no list entry → still have retail 0?
        // Use item with null-ish: set base_price but no discount → retail_discount needs discount.
        // Spec: rule 3 needs default_discount_bp. Without it and without 1&2 → none.
        $result = $this->resolver->resolve($this->account, $this->item);

        $this->assertFalse($result->found);
        $this->assertSame('none', $result->source);
    }

    #[Test]
    public function zero_account_list_price_is_honoured(): void
    {
        TradePriceListEntry::create([
            'trade_account_id' => $this->account->id,
            'item_id' => $this->item->id,
            'variant_id' => null,
            'price_laar' => 0,
            'is_active' => true,
        ]);

        $result = $this->resolver->resolve($this->account, $this->item);

        $this->assertTrue($result->found);
        $this->assertSame(0, $result->priceLaar);
        $this->assertSame('account_list', $result->source);
    }

    #[Test]
    public function active_promotion_does_not_change_wholesale_price(): void
    {
        $before = $this->resolver->resolve($this->account, $this->item);

        // Loud retail-side discounts that must never leak into wholesale.
        Promotion::create([
            'name' => 'Weekend 50% off',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 50,
            'auto_apply' => true,
            'is_active' => true,
            'scope' => 'item',
            'starts_at' => now()->subDay(),
            'expires_at' => now()->addDay(),
        ]);

        DailySpecial::create([
            'item_id' => $this->item->id,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'special_price' => 40.00,
            'is_active' => true,
        ]);

        $after = $this->resolver->resolve($this->account->fresh(), $this->item->fresh());

        $this->assertSame($before->priceLaar, $after->priceLaar);
        $this->assertSame('retail_discount', $after->source);
        $this->assertSame(9000, $after->priceLaar);
    }

    #[Test]
    public function variant_uses_variant_base_retail_not_item_base_price(): void
    {
        $this->item->update(['has_variants' => true, 'base_price' => 100.00]);
        $this->account->update(['default_discount_bp' => 1000]);

        $variant = Variant::create([
            'item_id' => $this->item->id,
            'name' => 'Large',
            'price' => 150.00,
            'is_active' => true,
        ]);

        $result = $this->resolver->resolve($this->account, $this->item, $variant);

        // 15000 laari − 10% = 13500
        $this->assertTrue($result->found);
        $this->assertSame(13500, $result->priceLaar);
    }
}
