<?php

declare(strict_types=1);

namespace App\Domains\Catering\Listeners;

use App\Domains\Catering\Events\CateringRequestSubmitted;
use App\Domains\Catering\Services\CateringEventCreatedNotifier;
use App\Domains\Catering\Services\CateringNotifyRecipients;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use Illuminate\Support\Facades\Log;

/**
 * Handles CateringRequestSubmitted for both simple inquiries and event drafts.
 *
 * Runs synchronously (not queued) so customer/admin SMS still send when the
 * Redis queue worker is down — same reliability pattern as payment confirmation.
 * Prefer dispatching CateringRequestSubmitted inside DeferAfterResponse so the
 * HTTP response is not blocked by the carrier round-trip.
 */
class SendCateringRequestStaffSmsListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly SmsService $sms,
        private readonly CateringEventCreatedNotifier $eventNotifier,
        private readonly CateringNotifyRecipients $recipients,
    ) {}

    public function handle(CateringRequestSubmitted $event): void
    {
        $req = $event->request;

        // Structured event drafts (wizard) — customer + staff "created" notifications.
        if ($req->status === 'draft' || filled($req->reference)) {
            $this->eventNotifier->notify($req);

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
