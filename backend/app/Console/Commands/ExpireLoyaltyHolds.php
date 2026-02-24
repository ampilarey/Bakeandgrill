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
            DB::transaction(function () use ($hold): void {
                $hold->update(['status' => 'expired']);

                DB::table('loyalty_accounts')
                    ->where('customer_id', $hold->customer_id)
                    ->update([
                        'points_held' => DB::raw("MAX(0, points_held - {$hold->points_held})"),
                    ]);
            });
            $count++;
        }

        $this->info("Expired {$count} loyalty holds.");

        return self::SUCCESS;
    }
}
