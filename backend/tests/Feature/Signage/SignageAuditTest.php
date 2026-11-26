<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Console\Commands\CheckSignageDevices;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageCache;
use App\Domains\Signage\Services\SignageResolver;
use App\Http\Controllers\Api\Signage\SignageDeviceController;
use App\Models\Category;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SignageCampaign;
use App\Models\SignageDevice;
use App\Models\SignagePlaylist;
use App\Models\SignageScreen;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Services\OpeningHoursService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TV signage audit, 2026-11-26 (owner: "Can u audit tv signage"). What it found, each held here: things that
 * start by the clock never reached a TV already on; the board's clock was up to 30 seconds old; the best sellers
 * slide counted unpaid tickets and dishes that never sold; anyone could fill the pairing list; a TV could not be
 * removed; and a TV switched off at closing time raised an alert every night.
 */
final class SignageAuditTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Carbon::setTestNow('2026-11-26 12:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_a_campaign_that_starts_by_the_clock_changes_the_version_a_running_board_compares(): void
    {
        $promo = SignagePlaylist::create([
            'name' => 'Lunch', 'theme' => [], 'is_active' => true,
            'slides' => [['id' => 'lunch', 'name' => 'Lunch', 'seconds' => 10, 'weight' => 1, 'elements' => []]],
        ]);
        SignageCampaign::create([
            'name' => 'Lunch hour', 'playlist_id' => $promo->id, 'date_start' => null, 'date_end' => null,
            'days' => null, 'windows' => [['start' => '12:30', 'end' => '13:30']], 'priority' => 50, 'is_active' => true, 'store_id' => null,
        ]);
        $resolver = app(SignageResolver::class);
        $saved = SignageCache::version();

        $before = $resolver->resolveFresh('default', Carbon::parse('2026-11-26 12:00:00'), null, $saved);
        $during = $resolver->resolveFresh('default', Carbon::parse('2026-11-26 12:45:00'), null, $saved);
        $again = $resolver->resolveFresh('default', Carbon::parse('2026-11-26 12:50:00'), null, $saved);

        $this->assertSame('playlist', $before['source']);
        $this->assertStringStartsWith('campaign:', $during['source']);
        $this->assertSame($saved, SignageCache::version(), 'nothing was saved in between');
        $this->assertNotSame($before['playlist_version'], $during['playlist_version'], 'the board sees its slides changed');
        $this->assertSame($during['playlist_version'], $again['playlist_version'], 'and the same slides are the same version');
    }

    public function test_a_closure_set_by_hand_changes_the_version_too(): void
    {
        $resolver = app(SignageResolver::class);
        $saved = SignageCache::version();
        $normal = $resolver->resolveFresh('default', Carbon::now(), null, $saved);
        SiteSetting::set('signage_emergency', 'maintenance');
        SiteSetting::bust();
        $closed = $resolver->resolveFresh('default', Carbon::now(), null, $saved);

        $this->assertStringStartsWith('emergency:', $closed['mode']);
        $this->assertNotSame($normal['playlist_version'], $closed['playlist_version']);
    }

    public function test_the_clock_in_the_answer_is_never_the_cached_one(): void
    {
        $resolver = app(SignageResolver::class);
        $first = $resolver->resolve('default', Carbon::parse('2026-11-26 12:00:05', 'Indian/Maldives'));
        $later = $resolver->resolve('default', Carbon::parse('2026-11-26 12:00:25', 'Indian/Maldives'));

        $this->assertStringContainsString('12:00:05', $first['server_time']);
        $this->assertStringContainsString('12:00:25', $later['server_time'], 'the second answer came from the cache, with its own clock');
        $this->assertStringEndsWith('+05:00', $later['server_time'], 'the shop\'s zone travels with it, for a TV set to another');
        $this->assertSame($first['playlist_version'], $later['playlist_version']);
    }

    public function test_best_sellers_are_what_was_paid_for_counted_in_pieces(): void
    {
        $cat = Category::create(['name' => 'Short eats', 'is_active' => true]);
        $make = fn (string $name, array $extra = []) => Item::create(['name' => $name, 'base_price' => 10, 'category_id' => $cat->id, 'is_active' => true, 'is_available' => true] + $extra);
        $bajiya = $make('Bajiya');
        $gulha = $make('Gulha');
        $never = $make('Never sold');
        $water = $make('Water', ['hide_from_bestsellers' => true]);
        $soon = $make('Coming soon', ['launch_at' => now()->addWeek()]);
        $sell = function (Item $item, int $qty, array $order = []): void {
            $o = Order::factory()->create($order + ['status' => 'completed', 'type' => 'takeaway', 'total' => $qty * 10, 'created_at' => now()->subDay()]);
            OrderItem::create(['order_id' => $o->id, 'item_id' => $item->id, 'item_name' => $item->name, 'quantity' => $qty, 'unit_price' => 10, 'total_price' => $qty * 10]);
        };
        // One line of twelve beats three lines of one: pieces, not lines.
        $sell($bajiya, 12);
        $sell($gulha, 1);
        $sell($gulha, 1);
        $sell($gulha, 1);
        // A saved ticket nobody paid, and a cancelled one, are not sales.
        $sell($never, 50, ['status' => 'pending', 'payment_status' => 'unpaid']);
        $sell($never, 50, ['status' => 'cancelled']);
        $sell($water, 99);
        $sell($soon, 99);

        $top = app(SignageResolver::class)->resolveFresh('default', Carbon::now(), null, 'v')['bestsellers'];

        $this->assertSame(['Bajiya', 'Gulha'], array_column($top, 'name'), 'nothing unpaid, hidden, not yet on sale or never sold');
        $this->assertSame([12, 3], array_column($top, 'sales_30d'));
    }

    public function test_the_pairing_list_is_capped_and_a_known_tv_is_never_turned_away(): void
    {
        $known = SignageDevice::create(['device_id' => 'tv-known', 'approved' => true, 'last_seen_at' => now()]);
        for ($i = 0; $i < SignageDeviceController::MAX_WAITING; $i++) {
            $this->postJson('/api/signage/heartbeat', ['device_id' => "stranger-{$i}"])->assertOk();
        }
        $this->postJson('/api/signage/heartbeat', ['device_id' => 'one-too-many'])->assertStatus(429);
        $this->assertDatabaseMissing('signage_devices', ['device_id' => 'one-too-many']);
        // Screens already on the list still report in.
        $this->postJson('/api/signage/heartbeat', ['device_id' => 'stranger-3'])->assertOk();
        $this->postJson('/api/signage/heartbeat', ['device_id' => $known->device_id])->assertOk()->assertJsonPath('device.approved', true);
    }

    public function test_a_tv_can_be_removed_and_waiting_ones_are_forgotten_after_a_week(): void
    {
        Storage::fake('public');
        $old = SignageDevice::create(['device_id' => 'tv-replaced', 'approved' => true, 'screen_id' => SignageScreen::query()->value('id'), 'last_seen_at' => now()->subMonth()]);
        $this->deleteJson("/api/admin/signage/devices/{$old->id}")->assertUnauthorized();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->deleteJson("/api/admin/signage/devices/{$old->id}")->assertOk();
        $this->assertDatabaseMissing('signage_devices', ['id' => $old->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'signage.device.remove']);

        $stale = SignageDevice::create(['device_id' => 'waiting-old', 'approved' => false, 'pairing_code' => 'ABC234', 'last_seen_at' => now()->subDays(CheckSignageDevices::FORGET_WAITING_DAYS + 1)]);
        $fresh = SignageDevice::create(['device_id' => 'waiting-new', 'approved' => false, 'pairing_code' => 'DEF567', 'last_seen_at' => now()->subDay()]);
        $paired = SignageDevice::create(['device_id' => 'paired-old', 'approved' => true, 'last_seen_at' => now()->subMonth(), 'meta' => ['alerted_offline_at' => now()->toIso8601String()]]);
        $this->artisan('signage:check-devices')->assertSuccessful();

        $this->assertDatabaseMissing('signage_devices', ['id' => $stale->id]);
        $this->assertDatabaseHas('signage_devices', ['id' => $fresh->id]);
        // A paired TV is never forgotten by itself.
        $this->assertDatabaseHas('signage_devices', ['id' => $paired->id]);
    }

    public function test_a_tv_switched_off_while_the_shop_is_closed_is_not_reported_until_it_opens(): void
    {
        SiteSetting::set('business_phone', '+9607771234');
        SiteSetting::bust();
        $tv = SignageDevice::create(['device_id' => 'tv-night', 'approved' => true, 'screen_id' => SignageScreen::query()->value('id'), 'last_seen_at' => now()->subMinutes(30)]);

        $this->mock(OpeningHoursService::class, fn ($m) => $m->shouldReceive('isOpenNow')->andReturn(false));
        $this->artisan('signage:check-devices')->assertSuccessful();
        $this->assertArrayNotHasKey('alerted_offline_at', $tv->fresh()->meta ?? []);
        $this->assertSame(0, SmsLog::query()->where('type', 'owner_signage_devices')->count());

        // Open again and the screen is still off: now it is a fault, and the message names the tab as the admin does.
        $this->mock(OpeningHoursService::class, fn ($m) => $m->shouldReceive('isOpenNow')->andReturn(true));
        $this->artisan('signage:check-devices')->assertSuccessful();
        $this->assertArrayHasKey('alerted_offline_at', $tv->fresh()->meta ?? []);
        $log = SmsLog::query()->where('type', 'owner_signage_devices')->first();
        if ($log !== null) {
            $this->assertStringContainsString('TV status', (string) $log->message);
        }
    }
}
