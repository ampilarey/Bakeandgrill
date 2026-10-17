<?php

declare(strict_types=1);

namespace App\Domains\System;

use App\Domains\Orders\Services\OrderCreationService;
use App\Models\Item;
use App\Models\Order;
use App\Services\OrderStatusMachine;
use Illuminate\Http\Request;
use Illuminate\Support\Defer\DeferredCallbackCollection;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Throwable;

/**
 * The deploy's smoke test (iruali import plan, feature 16): after the code,
 * the migrations and the caches change, does the site still take an order?
 *
 * It reads the menu through the real HTTP kernel, then places one takeaway
 * order through OrderCreationService, the code every till and online order
 * goes through, checks its lines and total, and cancels it through the status
 * machine. All of that runs inside a database transaction that is always
 * rolled back, with events, jobs, the queue, mail, notifications and outside
 * HTTP faked for this process, so nothing reaches the kitchen, a printer, a
 * customer, Telegram, a report or the stock, and no row is left behind (the
 * daily order number is a database counter, so it rolls back too).
 *
 * The page checks over the network stay in scripts/post-deploy-smoke.sh.
 */
class SmokeChecks
{
    /**
     * @return list<array{name: string, ok: bool, detail: string}>
     */
    public function run(): array
    {
        $results = [];
        $results[] = $this->check('Database', function (): string {
            DB::select('select 1');

            return 'Answers.';
        });
        $results[] = $this->check('Menu API', function (): string {
            $response = app()->handle(Request::create('/api/items', 'GET', [], [], [], ['HTTP_ACCEPT' => 'application/json']));
            if ($response->getStatusCode() !== 200) {
                throw new \RuntimeException('GET /api/items answered ' . $response->getStatusCode() . '.');
            }

            return 'GET /api/items answered 200.';
        });
        $results[] = $this->check('Place and cancel an order', fn (): string => $this->sandboxedOrder());

        return $results;
    }

    /** @param list<array{ok: bool}> $results */
    public static function failures(array $results): int
    {
        return count(array_filter($results, fn (array $r) => !$r['ok']));
    }

    /** @return array{name: string, ok: bool, detail: string} */
    private function check(string $name, callable $check): array
    {
        try {
            return ['name' => $name, 'ok' => true, 'detail' => (string) $check()];
        } catch (Throwable $e) {
            return ['name' => $name, 'ok' => false, 'detail' => $e->getMessage()];
        }
    }

    private function sandboxedOrder(): string
    {
        $item = Item::query()
            ->where('is_active', true)
            ->where('is_available', true)
            ->where('base_price', '>', 0)
            ->orderBy('id')
            ->first();
        if ($item === null) {
            throw new \RuntimeException('No active item with a price to order.');
        }

        $this->silenceTheOutsideWorld();
        $connection = DB::connection();
        $outer = $connection->transactionLevel();
        $connection->beginTransaction();
        try {
            $order = app(OrderCreationService::class)->createFromPayload([
                'type' => 'takeaway',
                'items' => [['item_id' => $item->id, 'quantity' => 2, 'unit_price' => (float) $item->base_price]],
                'notes' => 'Deploy smoke test (rolled back)',
            ], null);
            $order = Order::query()->with('items')->findOrFail($order->id);
            if ($order->items->count() !== 1 || (int) $order->items->first()->quantity !== 2) {
                throw new \RuntimeException('The order did not keep its line.');
            }
            if ((float) $order->total <= 0) {
                throw new \RuntimeException('The order total came out as ' . $order->total . '.');
            }
            if (!app(OrderStatusMachine::class)->isAllowed((string) $order->status, 'cancelled')) {
                throw new \RuntimeException("A new order ({$order->status}) cannot be cancelled.");
            }
            $order->update(['status' => 'cancelled']);
            if ($order->fresh()?->status !== 'cancelled') {
                throw new \RuntimeException('The order did not cancel.');
            }

            return "Order {$order->order_number} for 2 × {$item->name} came to MVR " . number_format((float) $order->total, 2)
                . ', cancelled, and rolled back.';
        } finally {
            while ($connection->transactionLevel() > $outer) {
                $connection->rollBack();
            }
            // Work deferred to after the command would look for the order
            // that no longer exists; drop it with the order.
            app()->instance(DeferredCallbackCollection::class, new DeferredCallbackCollection);
        }
    }

    /** For this process only: nothing the order sets off may leave it. */
    private function silenceTheOutsideWorld(): void
    {
        Event::fake();
        Bus::fake();
        Queue::fake();
        Mail::fake();
        Notification::fake();
        Http::fake(['*' => Http::response('', 200)]);
        Http::preventStrayRequests();
    }
}
