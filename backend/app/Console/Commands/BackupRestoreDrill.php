<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\System\RestoreDrill;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Restore the newest backup into the drill database, check it, empty it, and
 * tell the owner how it went (iruali import plan, feature 15). Monthly on the
 * 1st; row "Owner: backup restore drill" in Admin → System → Notifications.
 */
class BackupRestoreDrill extends Command
{
    public const TYPE = 'owner_restore_drill';

    protected $signature = 'backup:restore-drill';

    protected $description = 'Restore the newest backup into BACKUP_DRILL_DATABASE, compare key tables, empty it again';

    public function handle(RestoreDrill $drill, SmsService $sms): int
    {
        $result = $drill->run();
        $this->table(['Table', 'Live', 'Restored'], array_map(
            fn (string $t, array $r) => [$t, $r['live'], $r['restored'] ?? 'missing'],
            array_keys($result['tables']),
            $result['tables'],
        ));
        $this->line(strtoupper($result['status']) . ': ' . $result['detail']);

        if ($result['status'] !== 'skipped' && AlertSwitch::isOn(self::TYPE)) {
            $message = self::message($result);
            foreach (OwnerPhones::for(self::TYPE) as $phone) {
                try {
                    $sms->send(new SmsMessage(
                        to: $phone,
                        message: $message,
                        type: self::TYPE,
                        referenceType: 'restore_drill',
                        referenceId: now()->format('Y-m'),
                        idempotencyKey: 'restore-drill:' . now()->format('Y-m-d') . ':' . $phone,
                    ));
                } catch (\Throwable $e) {
                    Log::warning('Restore drill report could not be sent', ['phone' => $phone, 'error' => $e->getMessage()]);
                }
            }
        }

        return $result['status'] === 'fail' ? self::FAILURE : self::SUCCESS;
    }

    /** @param array{status: string, detail: string, tables: array<string, array{live: int, restored: ?int}>} $result */
    public static function message(array $result): string
    {
        $counts = implode(', ', array_map(
            fn (string $t, array $r) => $t . ' ' . ($r['restored'] ?? '–') . '/' . $r['live'],
            array_keys($result['tables']),
            $result['tables'],
        ));

        return 'Bake & Grill backup drill ' . ($result['status'] === 'pass' ? 'passed' : 'FAILED') . ': ' . $result['detail']
            . ($counts !== '' ? ' Rows restored/live: ' . $counts . '.' : '');
    }
}
