<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Models\Order;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The deploy's smoke test (iruali import plan, feature 16) places and cancels
 * a real order through the normal code, and leaves nothing behind: no order,
 * no order number used, no text. It rolls back only its own transaction, so
 * it runs the same inside the test's.
 */
class SmokeChecksTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_order_is_placed_cancelled_and_rolled_back(): void
    {
        $this->makeItem(false, 0, ['name' => 'Bajiya', 'base_price' => 12.5, 'is_active' => true, 'is_available' => true]);
        $sequences = DB::table('daily_sequences')->count();

        $exit = Artisan::call('app:smoke');
        $out = Artisan::output();

        $this->assertSame(0, $exit, $out);
        $this->assertStringContainsString('OK   Place and cancel an order', $out);
        $this->assertStringContainsString('cancelled, and rolled back', $out);
        $this->assertSame(0, Order::query()->withTrashed()->count(), 'no order is left');
        $this->assertSame($sequences, DB::table('daily_sequences')->count(), 'no order number is used up');
        $this->assertSame(0, SmsLog::query()->count(), 'nothing is sent');
    }

    public function test_it_fails_when_nothing_can_be_ordered(): void
    {
        $this->assertSame(1, Artisan::call('app:smoke'));
        $this->assertStringContainsString('No active item with a price', Artisan::output());
    }

    public function test_the_deploy_script_can_tell_the_owner(): void
    {
        \App\Domains\Permissions\PermissionCatalogSync::sync();
        $this->makeOwner(['phone' => '9607771234']);

        Artisan::call('deploy:alert', ['message' => 'test: abc1234 failed its smoke test and was rolled back to def5678.']);

        $this->assertStringContainsString('rolled back to def5678', (string) SmsLog::query()->where('type', 'owner_deploy_rollback')->value('message'));
    }
}
