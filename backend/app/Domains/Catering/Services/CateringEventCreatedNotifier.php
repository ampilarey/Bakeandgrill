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
        $viewUrl = $this->customerEventsUrl();

        if ($phone === '') {
            Log::warning('CateringEventCreatedNotifier: customer phone empty — SMS skipped', [
                'id' => $request->id,
                'reference' => $ref,
            ]);
        } else {
            // Same pattern as online order SMS: short confirm + view-details link.
            $message = "Event request {$ref} received. View details: {$viewUrl}";
            $log = $this->sms->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: 'transactional',
                customerId: $request->customer_id,
                referenceType: 'catering_request',
                referenceId: (string) $request->id,
                idempotencyKey: $baseKey . ':customer_sms',
            ));
            Log::info('CateringEventCreatedNotifier: customer SMS', [
                'id' => $request->id,
                'to' => $phone,
                'status' => $log->status,
                'error' => $log->error_message,
            ]);
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

        $adminUrl = $this->adminEventUrl((int) $request->id);
        $staffMsg = "New event {$ref}. View: {$adminUrl}";

        foreach ($targets as $i => $target) {
            if (!empty($target['phone'])) {
                $log = $this->sms->send(new SmsMessage(
                    to: (string) $target['phone'],
                    message: $staffMsg,
                    type: 'transactional',
                    referenceType: 'catering_request',
                    referenceId: (string) $request->id,
                    idempotencyKey: $baseKey . ':staff_sms:' . $i,
                ));
                Log::info('CateringEventCreatedNotifier: staff SMS', [
                    'id' => $request->id,
                    'to' => $target['phone'],
                    'status' => $log->status,
                    'error' => $log->error_message,
                ]);
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

    private function customerEventsUrl(): string
    {
        return rtrim((string) config('app.url'), '/') . '/order/events/mine';
    }

    private function adminEventUrl(int $id): string
    {
        $base = rtrim((string) (config('app.admin_url') ?: config('app.url')), '/');

        return $base . '/admin/catering/' . $id;
    }
}
