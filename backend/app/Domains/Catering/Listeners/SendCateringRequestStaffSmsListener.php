<?php

declare(strict_types=1);

namespace App\Domains\Catering\Listeners;

use App\Domains\Catering\Events\CateringRequestSubmitted;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\SiteSetting;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

class SendCateringRequestStaffSmsListener implements ShouldQueue
{
    public string $queue = 'default';

    public int $tries = 3;

    public bool $afterCommit = true;

    public function __construct(
        private readonly SmsService $sms,
    ) {}

    public function handle(CateringRequestSubmitted $event): void
    {
        $phone = trim((string) SiteSetting::get('catering_notify_phone', ''));
        if ($phone === '') {
            Log::info('SendCateringRequestStaffSmsListener: catering_notify_phone not set');

            return;
        }

        $req = $event->request;
        $date = $req->event_date?->toDateString() ?? 'TBD';
        $headcount = $req->headcount ?? '?';
        $name = $req->contact_name;
        $occasion = str_replace('_', ' ', (string) ($req->occasion ?? 'other'));

        $message = "Catering request: {$name}, {$occasion}, {$date}, {$headcount} guests. Phone {$req->phone}.";

        $this->sms->send(new SmsMessage(
            to: $phone,
            message: $message,
            type: 'transactional',
            referenceType: 'catering_request',
            referenceId: (string) $req->id,
            idempotencyKey: 'catering_request_notify:' . $req->id,
        ));
    }
}
