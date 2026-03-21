<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Order;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CancelStaleOrders extends Command
{
    protected $signature = 'orders:cancel-stale';

    protected $description = 'Cancel payment_pending orders that have exceeded the TTL without payment';

    public function handle(): int
    {
        $ttl = (int) config('ordering.payment_pending_ttl_minutes', 30);
        $cutoff = now()->subMinutes($ttl);

        $stale = Order::where('status', 'payment_pending')
            ->where('created_at', '<', $cutoff)
            ->get();

        if ($stale->isEmpty()) {
            return self::SUCCESS;
        }

        foreach ($stale as $order) {
            DB::transaction(function () use ($order): void {
                $order->update(['status' => 'cancelled']);

                // Release any active loyalty hold
                DB::table('loyalty_holds')
                    ->where('order_id', $order->id)
                    ->whereNull('released_at')
                    ->update(['released_at' => now(), 'status' => 'released']);

                Log::info('CancelStaleOrders: cancelled stale payment_pending order', [
                    'order_id' => $order->id,
                    'order_number' => $order->order_number,
                    'created_at' => $order->created_at,
                    'ttl_minutes' => $ttl,
                ]);
            });
        }

        $this->info("Cancelled {$stale->count()} stale order(s).");

        return self::SUCCESS;
    }
}
