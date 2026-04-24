<?php

declare(strict_types=1);

namespace App\Domains\Sms\Listeners;

use App\Domains\Notifications\Events\CustomerCreated;
use App\Domains\Sms\Jobs\SendStaffNotificationJob;
use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Models\SmsContact;
use App\Models\SmsTemplate;
use App\Models\StaffNotificationPref;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

class SendNewCustomerNotificationListener implements ShouldQueue
{
    public string $queue = 'default';

    public int $tries = 3;

    public function __construct(
        private readonly SmsTemplateRenderer $renderer,
    ) {}

    public function handle(CustomerCreated $event): void
    {
        if (!$this->isEnabled()) {
            return;
        }

        $template = SmsTemplate::where('slug', 'customer_new')->first();

        if (!$template) {
            Log::warning('SendNewCustomerNotificationListener: customer_new template not found');

            return;
        }

        $message = $this->renderer->render($template, [
            'name' => $event->data->name ?? 'Unknown',
            'phone' => $event->data->phone,
        ]);

        $recipients = $this->resolveRecipients();

        if ($recipients->isEmpty()) {
            Log::info('SendNewCustomerNotificationListener: no recipients configured', [
                'customer_id' => $event->data->customerId,
            ]);

            return;
        }

        foreach ($recipients as $recipient) {
            SendStaffNotificationJob::dispatch(
                orderId: $event->data->customerId,  // reuse order_id column as reference ID
                eventType: 'new_customer',
                phone: $recipient['phone'],
                message: $message,
                recipientType: $recipient['recipient_type'],
                recipientId: $recipient['recipient_id'],
                fallbackUsed: false,
            );
        }
    }

    /**
     * Recipients for new customer alerts:
     * 1. Staff marked as is_fallback (managers/owners who want all alerts)
     * 2. Active external SmsContacts (on-call numbers)
     */
    private function resolveRecipients(): \Illuminate\Support\Collection
    {
        $recipients = collect();

        // Fallback staff (managers/owners)
        $fallbackPrefs = StaffNotificationPref::where('is_fallback', true)
            ->with('user')
            ->get()
            ->filter(fn ($pref) => $pref->user && $pref->user->phone && $pref->user->is_active)
            ->map(fn ($pref) => [
                'phone' => $pref->user->phone,
                'recipient_type' => 'fallback',
                'recipient_id' => $pref->user_id,
            ]);

        $recipients = $recipients->merge($fallbackPrefs);

        // Active external SmsContacts
        $externalContacts = SmsContact::where('type', 'external')
            ->where('is_enabled', true)
            ->get()
            ->filter(fn (SmsContact $c) => $c->isActiveAt(now()))
            ->map(fn (SmsContact $c) => [
                'phone' => $c->resolvedPhone(),
                'recipient_type' => 'contact',
                'recipient_id' => $c->id,
            ])
            ->filter(fn ($r) => !empty($r['phone']));

        $recipients = $recipients->merge($externalContacts);

        return $recipients->unique('phone')->values();
    }

    private function isEnabled(): bool
    {
        try {
            $value = \App\Models\SiteSetting::get('staff_sms_new_customer_enabled', '1');

            return in_array($value, ['1', 'true', 'on', true], true);
        } catch (\Throwable) {
            return true;
        }
    }
}
