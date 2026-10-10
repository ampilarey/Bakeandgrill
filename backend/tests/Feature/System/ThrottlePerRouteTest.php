<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * UI audit, 2026-10-10: every `throttle:N,M` drew from one count per
 * address, so half a minute in the order app had the home page's hours,
 * prayer times and reviews refused, and ten quick reloads emptied the menu.
 * Each route now keeps its own count.
 */
class ThrottlePerRouteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware('throttle:2,1')->group(function () {
            Route::get('/_throttle-test/a', fn () => 'a');
            Route::get('/_throttle-test/b', fn () => 'b');
            Route::get('/_throttle-test/item/{id}', fn (string $id) => $id);
        });
    }

    public function test_one_route_running_out_leaves_other_routes_alone(): void
    {
        $this->get('/_throttle-test/a')->assertOk();
        $this->get('/_throttle-test/a')->assertOk();
        $this->get('/_throttle-test/a')->assertStatus(429);

        $this->get('/_throttle-test/b')->assertOk();
        $this->get('/_throttle-test/b')->assertOk();
        $this->get('/_throttle-test/b')->assertStatus(429);
    }

    public function test_one_route_counts_all_its_addresses_together(): void
    {
        $this->get('/_throttle-test/item/1')->assertOk();
        $this->get('/_throttle-test/item/2')->assertOk();
        $this->get('/_throttle-test/item/3')->assertStatus(429);
    }

    public function test_the_order_apps_status_calls_cannot_use_up_the_opening_hours(): void
    {
        // /api/service-status allows 120 a minute and /api/opening-hours 60.
        // Shared, the 61st status call left the hours page refused.
        for ($i = 0; $i < 61; $i++) {
            $this->getJson('/api/service-status')->assertOk();
        }

        $this->getJson('/api/opening-hours')->assertOk();
    }
}
