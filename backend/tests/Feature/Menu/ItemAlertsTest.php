<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Menu\Services\ItemAlerts;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemAlert;
use App\Models\SmsLog;
use App\Services\OpeningHoursService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/** "Tell me when it's back" and "coming soon" (iruali import plan, feature 8). */
class ItemAlertsTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607771111', 'is_active' => true]);
        $this->item = $this->makeItem(false, 0, ['name' => 'Kulhi boakibaa', 'is_available' => false]);
        $this->open(true);
        Sanctum::actingAs($this->customer, ['customer']);
    }

    private function open(bool $open): void
    {
        $hours = Mockery::mock(OpeningHoursService::class);
        $hours->shouldReceive('isOpenNow')->andReturn($open);
        $this->app->instance(OpeningHoursService::class, $hours);
    }

    public function test_a_customer_waits_and_hears_once_when_it_is_back(): void
    {
        $this->postJson("/api/customer/items/{$this->item->id}/alert")->assertOk()->assertJsonPath('kind', 'back');
        $this->getJson('/api/customer/item-alerts')->assertJsonPath('item_ids', [$this->item->id]);

        Artisan::call('items:alerts');
        $this->assertSame(0, SmsLog::query()->count(), 'still off');

        $this->item->update(['is_available' => true]);
        Artisan::call('items:alerts');
        Artisan::call('items:alerts');

        $log = SmsLog::query()->where('type', ItemAlerts::TYPE_BACK)->get();
        $this->assertCount(1, $log);
        $this->assertStringContainsString('Kulhi boakibaa is back', (string) $log->first()->message);
    }

    public function test_nobody_is_told_while_the_shop_is_closed(): void
    {
        $this->postJson("/api/customer/items/{$this->item->id}/alert")->assertOk();
        $this->item->update(['is_available' => true]);
        $this->open(false);

        Artisan::call('items:alerts');

        $this->assertSame(0, SmsLog::query()->count());
        $this->assertNull(ItemAlert::query()->value('sent_at'));
    }

    public function test_a_coming_soon_dish_stays_off_sale_and_goes_on_sale_on_its_day(): void
    {
        $dish = $this->makeItem(false, 0, ['name' => 'Mas huni roll', 'is_available' => true]);
        $dish->update(['launch_at' => now()->addDays(2)]);
        $this->assertFalse($dish->fresh()->is_available);
        $this->assertTrue($dish->fresh()->isComingSoon());

        $this->postJson("/api/customer/items/{$dish->id}/alert")->assertOk()->assertJsonPath('kind', 'launch');
        $this->travel(2)->days();
        $this->travel(1)->minutes();
        Artisan::call('items:alerts');

        $dish->refresh();
        $this->assertTrue($dish->is_available);
        $this->assertNull($dish->launch_at);
        $this->assertStringContainsString('Mas huni roll is on sale now', (string) SmsLog::query()->where('type', ItemAlerts::TYPE_LAUNCH)->value('message'));
    }

    public function test_a_dish_that_can_be_ordered_needs_no_alert(): void
    {
        $this->item->update(['is_available' => true]);

        $this->postJson("/api/customer/items/{$this->item->id}/alert")->assertStatus(422);
    }

    public function test_the_item_editor_counts_who_is_waiting(): void
    {
        $this->postJson("/api/customer/items/{$this->item->id}/alert")->assertOk();

        $this->assertSame(1, ItemAlerts::waiting($this->item->id));
    }

    public function test_the_dish_page_says_coming_soon_and_points_to_the_alert(): void
    {
        $this->app->forgetInstance(OpeningHoursService::class);
        $this->item->update(['launch_at' => now()->addDays(3)]);
        $this->get('/menu/' . $this->item->id)->assertOk()
            ->assertSee('<p>Coming soon</p>', false)
            ->assertSee('On sale from')
            ->assertSee('Tell me when it’s on sale');

        $sold = $this->makeItem(false, 0, ['name' => 'Bis keemiya', 'is_available' => false]);
        $this->get('/menu/' . $sold->id)->assertOk()->assertSee('Tell me when it’s back');
    }
}
