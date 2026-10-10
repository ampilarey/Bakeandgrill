<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsTypeRegistry;
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
        private readonly CustomerSmsMessageBuilder $messages,
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
        $viewUrl = $this->customerEventUrl($ref);

        if ($phone === '') {
            Log::warning('CateringEventCreatedNotifier: customer phone empty — SMS skipped', [
                'id' => $request->id,
                'reference' => $ref,
            ]);
        } else {
            $fallback = "Event request {$ref} received. View details: {$viewUrl}";
            $message = $this->messages->build(
                'catering_request_received',
                [
                    'reference' => $ref,
                    'view_url' => $viewUrl,
                    'contact_name' => (string) ($request->contact_name ?? ''),
                ],
                $fallback,
            );
            $log = $this->sms->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: 'catering_request_received',
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

        // The row's Email switch in Admin → Notifications is this email's switch (2026-10-10).
        $email = trim((string) ($request->email ?? ''));
        if ($email !== '' && SmsTypeRegistry::isEmailEnabled('catering_request_received')) {
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
            Log::warning('CateringEventCreatedNotifier: no staff recipients (choose who gets "Catering request (staff)" in Admin → Notifications)', [
                'id' => $request->id,
                'reference' => $ref,
            ]);

            return;
        }

        $adminUrl = $this->adminEventUrl((int) $request->id);
        $fallback = "New event {$ref}. View: {$adminUrl}";
        $staffMsg = $this->messages->build(
            'catering_request_staff',
            [
                'reference' => $ref,
                'view_url' => $adminUrl,
                'contact_name' => (string) ($request->contact_name ?? ''),
            ],
            $fallback,
        );

        // Each person by their own channels (SMS, email, Telegram); a typed
        // address by email (SmsService handles "user:" and "email:" addresses).
        foreach ($targets as $i => $to) {
            $log = $this->sms->send(new SmsMessage(
                to: $to,
                message: $staffMsg,
                type: 'catering_request_staff',
                referenceType: 'catering_request',
                referenceId: (string) $request->id,
                idempotencyKey: $baseKey . ':staff_sms:' . $i,
            ));
            Log::info('CateringEventCreatedNotifier: staff alert', [
                'id' => $request->id,
                'to' => $to,
                'status' => $log->status,
                'error' => $log->error_message,
            ]);
        }
    }

    private function customerEventUrl(string $reference): string
    {
        return rtrim((string) config('app.url'), '/') . '/order/events/mine/' . rawurlencode($reference);
    }

    private function adminEventUrl(int $id): string
    {
        return rtrim((string) config('app.url'), '/') . '/admin/catering/' . $id;
    }
}
