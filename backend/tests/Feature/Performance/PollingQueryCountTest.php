<?php

declare(strict_types=1);

namespace Tests\Feature\Performance;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * What the screens that ask again every few seconds cost.
 *
 * The kitchen board polls every fifteen seconds and is open for the whole of
 * service; the POS open-tickets list polls every thirty. Cost that scales with
 * the number of tickets on the board is worse here than anywhere else, because
 * it lands hardest exactly when service is busiest — a rush is when there are
 * most tickets *and* when the till can least afford to wait.
 *
 * Both were measured before this test was written and both were already flat:
 * the KDS query narrows its eager-loaded columns and hands each order to a
 * formatter rather than serialising the whole model. This fixes that in place
 * so it stays true, in the same shape as MenuQueryCountTest.
 */
class PollingQueryCountTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Comfortably above the flat cost (19 for the board, 6 for the tickets
     * list) and far below what one query per ticket would reach.
     */
    private const CEILING = 35;

    private const BUSY_SERVICE = 40;

    private function seedTickets(int $tickets, int $linesEach = 3): void
    {
        $category = Category::create(['name' => 'Food', 'is_active' => true]);
        $group = MenuGroup::create(['name' => 'Grill', 'slug' => 'grill', 'is_active' => true]);

        $items = [];
        for ($i = 0; $i < 8; $i++) {
            $items[] = Item::create([
                'name' => "Dish {$i}",
                'category_id' => $category->id,
                'menu_group_id' => $group->id,
                'base_price' => 50 + $i,
                'is_available' => true,
                'is_active' => true,
            ]);
        }

        for ($t = 0; $t < $tickets; $t++) {
            $order = Model::unguarded(fn () => Order::create([
                'order_number' => 'T' . str_pad((string) $t, 5, '0', STR_PAD_LEFT),
                'type' => 'pos',
                'status' => 'pending',
                'payment_status' => 'unpaid',
                'subtotal' => 100,
                'total' => 100,
                'fired_at' => now()->subMinutes($t),
            ]));

            for ($l = 0; $l < $linesEach; $l++) {
                $item = $items[($t + $l) % count($items)];
                Model::unguarded(fn () => OrderItem::create([
                    'order_id' => $order->id,
                    'item_id' => $item->id,
                    'item_name' => $item->name,
                    'quantity' => 1,
                    'unit_price' => $item->base_price,
                    'total_price' => $item->base_price,
                ]));
            }
        }
    }

    private function signInAsKitchenManager(): void
    {
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function assertFlat(string $label, string $uri, int $tickets): void
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson($uri)->assertOk();
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertLessThanOrEqual(
            self::CEILING,
            $queries,
            sprintf(
                '%s cost %d queries for %d tickets (ceiling %d) — about %.1f per ticket. '
                . 'This screen re-asks every few seconds all through service, so anything '
                . 'per-ticket here is paid again every fifteen seconds at the busiest moment '
                . 'of the day.',
                $label,
                $queries,
                $tickets,
                self::CEILING,
                $queries / max(1, $tickets),
            ),
        );
    }

    public function test_the_kitchen_board_does_not_query_per_ticket(): void
    {
        $this->signInAsKitchenManager();
        $this->seedTickets(self::BUSY_SERVICE);

        $this->assertFlat('The kitchen board', '/api/kds/orders', self::BUSY_SERVICE);
    }

    public function test_the_open_tickets_list_does_not_query_per_ticket(): void
    {
        $this->signInAsKitchenManager();
        $this->seedTickets(self::BUSY_SERVICE);

        $this->assertFlat('The POS open-tickets list', '/api/orders?status=pending', self::BUSY_SERVICE);
    }

    public function test_a_quiet_board_costs_about_what_a_busy_one_does(): void
    {
        // The shape, not the number: five tickets and forty must land in the
        // same place, or something is being asked once per ticket.
        $this->signInAsKitchenManager();
        $this->seedTickets(5);

        $this->assertFlat('The kitchen board', '/api/kds/orders', 5);
    }
}
