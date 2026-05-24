<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Device;
use Illuminate\Console\Command;

/**
 * One-time / maintenance cleanup for legacy POS rows stuck in pending status.
 * New POS logins auto-approve; this clears the admin backlog.
 */
class ApprovePendingPosDevicesCommand extends Command
{
    protected $signature = 'devices:approve-pending-pos {--dry-run : List only, do not update}';

    protected $description = 'Approve all pending POS devices (legacy audit rows)';

    public function handle(): int
    {
        $query = Device::query()
            ->where('status', 'pending')
            ->where(function ($q) {
                $q->where('type', 'pos')->orWhereNull('type');
            });

        $count = (clone $query)->count();

        if ($count === 0) {
            $this->info('No pending POS devices.');

            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->warn("Would approve {$count} pending POS device(s).");

            return self::SUCCESS;
        }

        $updated = $query->update([
            'status' => 'approved',
            'is_active' => true,
            'last_seen_at' => now(),
        ]);

        $this->info("Approved {$updated} pending POS device(s).");

        return self::SUCCESS;
    }
}
