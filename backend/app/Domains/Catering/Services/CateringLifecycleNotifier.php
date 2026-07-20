<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\CateringRequest;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Quote expiry, day-before reminder, and cancellation notifications.
 */
class CateringLifecycleNotifier
{
    public function __construct(
        private readonly SmsService $sms,
        private readonly CateringNotifyRecipients $recipients,
    ) {}

    public function notifyQuoteExpired(CateringRequest $request): void
    {
        $ref = $request->reference ?? ('#' . $request->id);
        $version = (int) $request->quote_version;
        $baseKey = 'event:' . $request->id . ':' . $version . ':quote_expired';
        $customerMsg = "Your quote {$ref} expired — contact us to renew";
        $staffMsg = "Quote expired for {$ref}";

        $this->fanOut($request, $customerMsg, $staffMsg, $baseKey, "Quote expired {$ref} — Bake & Grill");
    }

    public function notifyCancelled(CateringRequest $request): void
    {
        $ref = $request->reference ?? ('#' . $request->id);
        $version = max(1, (int) $request->quote_version);
        $baseKey = 'event:' . $request->id . ':' . $version . ':cancelled';
        $customerMsg = "Event {$ref} was cancelled. Contact us if you have questions.";
        $staffMsg = "Event cancelled: {$ref}";

        $this->fanOut($request, $customerMsg, $staffMsg, $baseKey, "Event cancelled {$ref} — Bake & Grill");
    }

    public function notifyReminder(CateringRequest $request): void
    {
        $ref = $request->reference ?? ('#' . $request->id);
        $version = max(1, (int) $request->quote_version);
        $baseKey = 'event:' . $request->id . ':' . $version . ':reminder';
        $date = $request->event_date?->format('D, j M') ?? 'tomorrow';
        $time = $request->fulfillment_time
            ? \Illuminate\Support\Carbon::parse($request->fulfillment_time)->format('g:ia')
            : '';
        $venue = $request->venue_name ?: (($request->fulfillment_method ?? '') === 'delivery' ? 'delivery' : 'pickup');
        $customerMsg = "Reminder: event {$ref} is tomorrow ({$date}" . ($time ? " {$time}" : '') . ") — {$venue}";
        $staffMsg = "Tomorrow: event {$ref} ({$date}" . ($time ? " {$time}" : '') . ") — {$venue}";

        $this->fanOut($request, $customerMsg, $staffMsg, $baseKey, "Event reminder {$ref} — Bake & Grill");
    }

    private function fanOut(
        CateringRequest $request,
        string $customerMsg,
        string $staffMsg,
        string $baseKey,
        string $emailSubject,
    ): void {
        if (trim((string) $request->phone) !== '') {
            $this->sms->send(new SmsMessage(
                to: (string) $request->phone,
                message: $customerMsg,
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
                Mail::raw($customerMsg, function ($message) use ($email, $emailSubject) {
                    $message->to($email)->subject($emailSubject);
                });
            } catch (\Throwable $e) {
                Log::warning('CateringLifecycleNotifier: customer email failed', [
                    'id' => $request->id,
                    'key' => $baseKey,
                    'error' => $e->getMessage(),
                ]);
            }
        }

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
                    Mail::raw($staffMsg, function ($message) use ($target, $emailSubject) {
                        $message->to((string) $target['email'])->subject($emailSubject);
                    });
                } catch (\Throwable $e) {
                    Log::warning('CateringLifecycleNotifier: staff email failed', [
                        'id' => $request->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }
    }
}
