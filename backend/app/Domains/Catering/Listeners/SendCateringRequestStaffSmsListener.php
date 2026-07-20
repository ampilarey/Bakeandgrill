<?php

declare(strict_types=1);

namespace App\Domains\Catering\Listeners;

use App\Domains\Catering\Events\CateringRequestSubmitted;
use App\Domains\Catering\Services\CateringNotifyRecipients;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use Illuminate\Support\Facades\Log;

/**
 * Staff SMS for simple catering web inquiries (status=new).
 * Event wizard drafts notify via EventOrderController (sync).
 */
class SendCateringRequestStaffSmsListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly SmsService $sms,
        private readonly CateringNotifyRecipients $recipients,
    ) {}

    public function handle(CateringRequestSubmitted $event): void
    {
        $req = $event->request;

        // Wizard drafts are notified synchronously in EventOrderController::store
        // (queue/defer was dropping SMS when workers/terminating callbacks failed).
        if ($req->status === 'draft' || filled($req->reference)) {
            return;
        }

        // Simple web inquiry — staff only (legacy behaviour + email setting).
        $targets = $this->recipients->fromSettingsFallback();
        if ($targets === []) {
            Log::info('SendCateringRequestStaffSmsListener: no catering notify recipients configured');

            return;
        }

        $date = $req->event_date?->toDateString() ?? 'TBD';
        $headcount = $req->headcount ?? '?';
        $name = $req->contact_name;
        $occasion = str_replace('_', ' ', (string) ($req->occasion ?? 'other'));
        $message = "Catering request: {$name}, {$occasion}, {$date}, {$headcount} guests. Phone {$req->phone}.";

        foreach ($targets as $i => $target) {
            if (!empty($target['phone'])) {
                $this->sms->send(new SmsMessage(
                    to: (string) $target['phone'],
                    message: $message,
                    type: 'transactional',
                    referenceType: 'catering_request',
                    referenceId: (string) $req->id,
                    idempotencyKey: 'catering_request_notify:' . $req->id . ':' . $i,
                ));
            }
        }
    }
}
