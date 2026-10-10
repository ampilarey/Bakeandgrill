<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsTypeRegistry;
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
        $customerMsg = "Your quote {$ref} expired - contact us to renew";
        $staffMsg = "Quote expired for {$ref}";

        $this->fanOut($request, $customerMsg, $staffMsg, $baseKey, "Quote expired {$ref} - Bake & Grill");
    }

    /** Ops audit, 2026-09-25: a quote about to expire gets one nudge, the day before. */
    public function notifyQuoteExpiring(CateringRequest $request): void
    {
        $ref = $request->reference ?? ('#' . $request->id);
        $version = (int) $request->quote_version;
        $baseKey = 'event:' . $request->id . ':' . $version . ':quote_expiring';
        $until = $request->quote_expires_at?->timezone(config('app.timezone', 'Indian/Maldives'))->format('D j M g:ia') ?? 'soon';
        $customerMsg = "Your Bake & Grill quote {$ref} is open until {$until}. Approve it from the link we sent, or reply if you need changes.";
        $staffMsg = "Quote {$ref} expires {$until} with no answer yet.";

        $this->fanOut($request, $customerMsg, $staffMsg, $baseKey, "Quote {$ref} expires soon - Bake & Grill");
    }

    /** The day after the event: thanks, and an ask for feedback. Customer only. */
    public function notifyThankYou(CateringRequest $request): void
    {
        if (trim((string) $request->phone) === '') {
            return;
        }
        $ref = $request->reference ?? ('#' . $request->id);
        $this->sms->send(new SmsMessage(
            to: (string) $request->phone,
            message: "Thank you for having Bake & Grill cater {$ref}. We hope it went well - reply to this text or call us with any feedback, and we would love to do the next one.",
            type: 'catering_lifecycle_customer',
            customerId: $request->customer_id,
            referenceType: 'catering_request',
            referenceId: (string) $request->id,
            idempotencyKey: 'event:' . $request->id . ':thank_you',
        ));
    }

    public function notifyCancelled(CateringRequest $request): void
    {
        $ref = $request->reference ?? ('#' . $request->id);
        $version = max(1, (int) $request->quote_version);
        $baseKey = 'event:' . $request->id . ':' . $version . ':cancelled';
        $customerMsg = "Event {$ref} was cancelled. Contact us if you have questions.";
        $staffMsg = "Event cancelled: {$ref}";

        $this->fanOut($request, $customerMsg, $staffMsg, $baseKey, "Event cancelled {$ref} - Bake & Grill");
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
        $customerMsg = "Reminder: event {$ref} is tomorrow ({$date}" . ($time ? " {$time}" : '') . ") - {$venue}";
        $staffMsg = "Tomorrow: event {$ref} ({$date}" . ($time ? " {$time}" : '') . ") - {$venue}";

        // Its own rows in Admin → Notifications since 2026-10-10 (it shared
        // the "change" rows, and a switch on Settings → Ordering).
        $this->fanOut($request, $customerMsg, $staffMsg, $baseKey, "Event reminder {$ref} - Bake & Grill", 'catering_reminder_customer', 'catering_reminder_staff');
    }

    private function fanOut(
        CateringRequest $request,
        string $customerMsg,
        string $staffMsg,
        string $baseKey,
        string $emailSubject,
        string $customerType = 'catering_lifecycle_customer',
        string $staffType = 'catering_lifecycle_staff',
    ): void {
        if (trim((string) $request->phone) !== '') {
            $this->sms->send(new SmsMessage(
                to: (string) $request->phone,
                message: $customerMsg,
                type: $customerType,
                customerId: $request->customer_id,
                referenceType: 'catering_request',
                referenceId: (string) $request->id,
                idempotencyKey: $baseKey . ':customer_sms',
            ));
        }

        // The event contact's email: the row's Email switch in Admin →
        // Notifications is its switch (2026-10-10), and it is the one email
        // they get about it (SmsEmailCopier::HAS_OWN_EMAIL).
        $email = trim((string) ($request->email ?? ''));
        if ($email !== '' && SmsTypeRegistry::isEmailEnabled($customerType)) {
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

        // Staff: the row's audience, each person by their own channels.
        foreach ($this->recipients->forLifecycle($request, $staffType) as $i => $to) {
            $this->sms->send(new SmsMessage(
                to: $to,
                message: $staffMsg,
                type: $staffType,
                referenceType: 'catering_request',
                referenceId: (string) $request->id,
                idempotencyKey: $baseKey . ':staff_sms:' . $i,
            ));
        }
    }
}
