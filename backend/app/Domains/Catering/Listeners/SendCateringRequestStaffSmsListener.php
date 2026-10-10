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

        // Simple web inquiry: whoever "Catering request (staff)" goes to in
        // Admin → Notifications (re-audit 2026-10-10; it used to go only to
        // the fallback phone typed on Settings → Ordering).
        $targets = $this->recipients->forCreated();
        if ($targets === []) {
            Log::info('SendCateringRequestStaffSmsListener: nobody gets "Catering request (staff)"');

            return;
        }

        $date = $req->event_date?->toDateString() ?? 'TBD';
        $headcount = $req->headcount ?? '?';
        $name = $req->contact_name;
        $occasion = str_replace('_', ' ', (string) ($req->occasion ?? 'other'));
        $message = "Catering request: {$name}, {$occasion}, {$date}, {$headcount} guests. Phone {$req->phone}.";

        foreach ($targets as $i => $to) {
            $this->sms->send(new SmsMessage(
                to: $to,
                message: $message,
                type: 'catering_request_staff',
                referenceType: 'catering_request',
                referenceId: (string) $req->id,
                idempotencyKey: 'catering_request_notify:' . $req->id . ':' . $i,
            ));
        }
    }
}
