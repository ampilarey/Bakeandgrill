<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * scripts/full-deploy.sh tells the owner when a deploy's smoke test failed,
 * and whether the code was put back (iruali import plan, feature 16). Row
 * "Owner: deploy failed its smoke test" in Admin → System → Notifications.
 */
class DeployAlert extends Command
{
    public const TYPE = 'owner_deploy_rollback';

    protected $signature = 'deploy:alert {message : What happened, in plain words}';

    protected $description = 'Tell the owner a deploy failed its smoke test (used by scripts/full-deploy.sh)';

    public function handle(SmsService $sms): int
    {
        $message = 'Bake & Grill deploy: ' . trim((string) $this->argument('message'));
        $this->line($message);
        if (!AlertSwitch::isOn(self::TYPE)) {
            $this->line('The deploy alert is off; nothing sent.');

            return self::SUCCESS;
        }
        foreach (OwnerPhones::for(self::TYPE) as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: self::TYPE,
                    referenceType: 'deploy',
                    referenceId: now()->format('Y-m-d H:i'),
                    idempotencyKey: 'deploy-alert:' . sha1($message . now()->format('YmdHi')) . ':' . $phone,
                ));
            } catch (\Throwable $e) {
                Log::warning('Deploy alert could not be sent', ['phone' => $phone, 'error' => $e->getMessage()]);
            }
        }

        return self::SUCCESS;
    }
}
