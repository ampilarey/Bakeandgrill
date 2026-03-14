<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\OtpVerification;
use Illuminate\Console\Command;

class PruneOtpVerifications extends Command
{
    protected $signature   = 'otp:prune';
    protected $description = 'Delete OTP verification records older than 24 hours';

    public function handle(): int
    {
        $deleted = OtpVerification::where('created_at', '<', now()->subDay())->delete();
        $this->info("Pruned {$deleted} expired OTP record(s).");

        return self::SUCCESS;
    }
}
