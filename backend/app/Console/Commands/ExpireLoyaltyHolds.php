<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\LoyaltyHold;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ExpireLoyaltyHolds extends Command
{
    protected $signature = 'app:expire-loyalty-holds';

    protected $description = 'Expire active loyalty holds that have passed their TTL';

    public function handle(): int
    {
        $expired = LoyaltyHold::where('status', 'active')
            ->where('expires_at', '<', now())
            ->get();

        $count = 0;
        foreach ($expired as $hold) {
            DB::transaction(function () use ($hold, &$count): void {
                // Lock the row inside the transaction so concurrent cron runs can't
                // both process the same hold and double-decrement points_held.
                $locked = LoyaltyHold::where('id', $hold->id)
                    ->where('status', 'active')
                    ->lockForUpdate()
                    ->first();

                if (! $locked) {
                    return; // Already processed by a concurrent instance
                }

                $locked->update(['status' => 'expired']);

                $pointsHeld = (int) $locked->points_held;
                DB::table('loyalty_accounts')
                    ->where('customer_id', $locked->customer_id)
                    ->update([
                        'points_held' => DB::raw("GREATEST(0, points_held - {$pointsHeld})"),
                    ]);

                $count++;
            });
        }

        $this->info("Expired {$count} loyalty holds.");

        return self::SUCCESS;
    }
}
