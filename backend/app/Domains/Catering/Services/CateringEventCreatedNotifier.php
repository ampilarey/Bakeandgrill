<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Mail\EventRequestReceivedMail;
use App\Models\CateringRequest;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Customer + staff "event created" notifications.
 * Idempotency: event:{id}:1:created (and channel suffixes).
 */
class CateringEventCreatedNotifier
{
    public function __construct(
        private readonly SmsService $sms,
        private readonly CateringNotifyRecipients $recipients,
    ) {}

    public function notify(CateringRequest $request): void
    {
        $request->loadMissing('lines');
        $ref = $request->reference ?? ('#' . $request->id);
        $baseKey = 'event:' . $request->id . ':1:created';

        $this->notifyCustomer($request, $ref, $baseKey);
        $this->notifyStaff($request, $ref, $baseKey);
    }

    private function notifyCustomer(CateringRequest $request, string $ref, string $baseKey): void
    {
        $phone = trim((string) $request->phone);
        if ($phone !== '') {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: "Event request {$ref} received — we'll send your quote soon",
                type: 'transactional',
                customerId: $request->customer_id,
                referenceType: 'catering_request',
                referenceId: (string) $request->id,
                idempotencyKey: $baseKey . ':customer_sms',
            ));
        }

        $email = trim((string) ($request->email ?? ''));
        if ($email !== '') {
            try {
                Mail::to($email)->send(new EventRequestReceivedMail(
                    $request,
                    $request->contact_name ?: 'there',
                ));
            } catch (\Throwable $e) {
                Log::warning('CateringEventCreatedNotifier: customer email failed', [
                    'id' => $request->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    private function notifyStaff(CateringRequest $request, string $ref, string $baseKey): void
    {
        $targets = $this->recipients->forCreated();
        if ($targets === []) {
            Log::warning('CateringEventCreatedNotifier: no staff recipients (set catering_notify_phone or events.manage phones)', [
                'id' => $request->id,
                'reference' => $ref,
            ]);

            return;
        }

        $date = $request->event_date?->toDateString() ?? 'TBD';
        $method = $request->fulfillment_method === 'delivery' ? 'delivery' : 'pickup';
        $name = $request->contact_name;
        $lineCount = $request->lines->count();
        $staffMsg = "Event {$ref}: {$name}, {$method}, {$date}, {$lineCount} lines. Phone {$request->phone}.";

        foreach ($targets as $i => $target) {
            if (!empty($target['phone'])) {
                $this->sms->send(new SmsMessage(
                    to: (string) $target['phone'],
                    message: $staffMsg,
                    type: 'transactional',
                    referenceType: 'catering_request',
                    referenceId: (string) $request->id,
                    idempotencyKey: $baseKey . ':staff_sms:' . $i,
                ));
            }
            if (!empty($target['email'])) {
                try {
                    Mail::raw($staffMsg, function ($message) use ($target, $ref) {
                        $message->to((string) $target['email'])
                            ->subject("Event request {$ref} — Bake & Grill");
                    });
                } catch (\Throwable $e) {
                    Log::warning('CateringEventCreatedNotifier: staff email failed', [
                        'id' => $request->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }
    }
}
