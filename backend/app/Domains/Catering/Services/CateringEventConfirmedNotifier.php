<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Mail\EventConfirmedMail;
use App\Models\CateringRequest;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Customer + staff notifications when quote payment confirms the event.
 * Idempotency: event:{id}:{version}:confirmed (+ channel suffixes).
 */
class CateringEventConfirmedNotifier
{
    public function __construct(
        private readonly SmsService $sms,
        private readonly CateringNotifyRecipients $recipients,
    ) {}

    public function notify(CateringRequest $request, int $paidLaar, int $balanceLaar): void
    {
        $ref = $request->reference ?? ('#' . $request->id);
        $version = (int) $request->quote_version;
        $baseKey = 'event:' . $request->id . ':' . $version . ':confirmed';
        $paidMvr = number_format($paidLaar / 100, 2);
        $balanceBit = $balanceLaar > 0
            ? ', balance MVR ' . number_format($balanceLaar / 100, 2) . ' due on the day'
            : '';

        $when = $this->formatWhen($request);
        $venue = $this->formatVenue($request);

        $customerMsg = "Event confirmed — ref {$ref}, paid MVR {$paidMvr}{$balanceBit}. {$when}{$venue}";
        $this->notifyCustomer($request, $customerMsg, $baseKey, $paidLaar, $balanceLaar);

        $staffMsg = "Event confirmed {$ref}: paid MVR {$paidMvr}{$balanceBit}. {$when}";
        foreach ($this->recipients->forLifecycle($request) as $i => $target) {
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
                            ->subject("Event confirmed {$ref} — Bake & Grill");
                    });
                } catch (\Throwable $e) {
                    Log::warning('CateringEventConfirmedNotifier: staff email failed', [
                        'id' => $request->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }
    }

    private function notifyCustomer(
        CateringRequest $request,
        string $smsMsg,
        string $baseKey,
        int $paidLaar,
        int $balanceLaar,
    ): void {
        if (trim((string) $request->phone) !== '') {
            $this->sms->send(new SmsMessage(
                to: (string) $request->phone,
                message: $smsMsg,
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
                Mail::to($email)->send(new EventConfirmedMail($request, $paidLaar, $balanceLaar));
            } catch (\Throwable $e) {
                Log::warning('CateringEventConfirmedNotifier: customer email failed', [
                    'id' => $request->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    private function formatWhen(CateringRequest $request): string
    {
        $date = $request->event_date?->format('D, j M Y') ?? 'TBD';
        $time = $request->fulfillment_time
            ? \Illuminate\Support\Carbon::parse($request->fulfillment_time)->format('g:ia')
            : null;

        return $time ? "{$date} {$time}. " : "{$date}. ";
    }

    private function formatVenue(CateringRequest $request): string
    {
        if ($request->venue_name) {
            return 'Venue: '.$request->venue_name.'.';
        }
        if (($request->fulfillment_method ?? '') === 'delivery' && $request->delivery_address) {
            return 'Delivery: '.$request->delivery_address
                .($request->delivery_island ? ', '.$request->delivery_island : '').'.';
        }

        return 'Pickup at Bake & Grill.';
    }
}
