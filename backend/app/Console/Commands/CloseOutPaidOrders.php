<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Orders\DTOs\OrderCompletedData;
use App\Domains\Orders\Events\OrderCompleted;
use App\Models\Order;
use App\Services\AuditLogService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Close the tickets the counter took money for and nobody ever bumped.
 *
 * Owner, 2026-09-09: the kitchen display was showing 77 tickets from four
 * days earlier, every one of them paid. A ticket only leaves the board when
 * a cashier marks it ready and someone bumps it, and until it reaches
 * `completed` it is invisible to every sales, GST and forecasting report.
 * Four days of real trade were missing from the books.
 *
 * What this closes, and nothing else: an order whose money is in
 * (`payment_status = paid`) and whose status can go straight to completed
 * (`paid` or `ready`). Those two facts together mean the customer paid and
 * the food went out; marking it completed is bookkeeping, not a judgement.
 *
 * What it deliberately leaves alone: anything unpaid, part-paid, or still
 * in the kitchen's hands. Completing an unpaid ticket books revenue nobody
 * took. Those are listed at the end and, on the scheduled run, raised as an
 * ops alert so a person looks at them.
 *
 * Stock is untouched by design. Prepared stock comes off at order creation,
 * not at completion, so there is nothing to deduct days later for food that
 * is long gone.
 */
class CloseOutPaidOrders extends Command
{
    protected $signature = 'orders:close-out
                            {--days=1 : Close paid tickets older than this many days}
                            {--before= : Close paid tickets created before this date (Y-m-d), overrides --days}
                            {--dry-run : List what would be closed and change nothing}
                            {--limit=1000 : Stop after this many orders}';

    protected $description = 'Complete paid orders left open on the kitchen display';

    /** Statuses that hold money already taken and may go straight to completed. */
    private const CLOSEABLE = ['paid', 'ready'];

    /** Still open past the cutoff but not ours to close. */
    private const NEEDS_A_PERSON = ['pending', 'partial', 'in_progress', 'preparing', 'held'];

    public function handle(): int
    {
        $cutoff = $this->cutoff();
        if ($cutoff === null) {
            $this->error('--before must be a date like 2026-09-06.');

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $limit = max(1, (int) $this->option('limit'));

        $orders = Order::query()
            ->whereIn('status', self::CLOSEABLE)
            ->where('payment_status', 'paid')
            ->where('created_at', '<', $cutoff)
            ->orderBy('created_at')
            ->limit($limit)
            ->get();

        $this->line(sprintf(
            '%s paid ticket(s) created before %s.',
            $orders->count() === 0 ? 'No' : $orders->count(),
            $cutoff->toDateTimeString(),
        ));

        if ($orders->isNotEmpty()) {
            $this->table(
                ['Order', 'Date', 'Status', 'Total'],
                $orders->map(fn (Order $o) => [
                    $o->order_number,
                    $o->created_at?->toDateString() ?? '—',
                    $o->status,
                    number_format((float) $o->total, 2),
                ])->all(),
            );
            $this->line('Total: MVR ' . number_format((float) $orders->sum('total'), 2));
        }

        $closed = 0;
        if (!$dryRun) {
            foreach ($orders as $stale) {
                $closed += $this->close($stale->id) ? 1 : 0;
            }
        }

        $this->line($dryRun
            ? 'Dry run — nothing was changed.'
            : "Closed {$closed} order(s).");

        $this->reportStragglers($cutoff);

        return self::SUCCESS;
    }

    /** One order, row-locked, so two runs cannot close it twice. */
    private function close(int $orderId): bool
    {
        return (bool) DB::transaction(function () use ($orderId) {
            $order = Order::lockForUpdate()->find($orderId);

            // A concurrent run, or a cashier, may have moved it already.
            if (!$order
                || !in_array($order->status, self::CLOSEABLE, true)
                || $order->payment_status !== 'paid') {
                return false;
            }

            $was = $order->status;
            $order->update([
                'status' => 'completed',
                // The sale keeps the day it was rung up: every report dates
                // orders by created_at, so the money lands where it belongs.
                'completed_at' => $order->completed_at ?? now(),
            ]);

            app(AuditLogService::class)->log(
                'order.closed_out',
                'Order',
                $order->id,
                ['status' => $was],
                ['status' => 'completed'],
                ['source' => 'orders:close-out', 'order_number' => $order->order_number],
            );

            Log::info('CloseOutPaidOrders: completed a paid ticket left open', [
                'order_id' => $order->id,
                'order_number' => $order->order_number,
                'was' => $was,
                'created_at' => $order->created_at?->toDateTimeString(),
            ]);

            $fresh = $order->fresh();
            DB::afterCommit(function () use ($fresh): void {
                OrderCompleted::dispatch(OrderCompletedData::fromOrder($fresh));
            });

            return true;
        });
    }

    /** Open past the cutoff but not safe to close automatically. */
    private function reportStragglers(Carbon $cutoff): void
    {
        $rows = Order::query()
            ->where(function ($q) {
                $q->whereIn('status', self::NEEDS_A_PERSON)
                    ->orWhere(function ($inner) {
                        $inner->whereIn('status', self::CLOSEABLE)
                            ->where(fn ($p) => $p->where('payment_status', '!=', 'paid')->orWhereNull('payment_status'));
                    });
            })
            ->where('created_at', '<', $cutoff)
            ->selectRaw('status, payment_status, COUNT(*) as n, SUM(total) as total')
            ->groupBy('status', 'payment_status')
            ->get();

        if ($rows->isEmpty()) {
            return;
        }

        $this->newLine();
        $this->warn('Left alone — these need a person, because the money is not confirmed:');
        $this->table(
            ['Status', 'Payment', 'Orders', 'Value'],
            $rows->map(fn ($r) => [
                $r->status,
                $r->payment_status ?? '—',
                (int) $r->n,
                number_format((float) $r->total, 2),
            ])->all(),
        );
    }

    private function cutoff(): ?Carbon
    {
        $before = $this->option('before');
        if ($before === null || $before === '') {
            return now()->subDays(max(0, (int) $this->option('days')))->startOfDay();
        }

        try {
            return Carbon::createFromFormat('Y-m-d', (string) $before, config('app.timezone'))->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }
}
