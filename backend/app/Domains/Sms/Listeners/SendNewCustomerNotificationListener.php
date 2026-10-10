<?php

declare(strict_types=1);

namespace App\Domains\Sms\Listeners;

use App\Domains\Notifications\Events\CustomerCreated;
use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Notifications\Support\NotificationChannels;
use App\Domains\Sms\Jobs\SendStaffNotificationJob;
use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Models\SmsContact;
use App\Models\SmsTemplate;
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
        // SMS off (to save cost) still sends the email and Telegram copies
        // (owner, 2026-10-06); every channel off sends nothing.
        $smsOn = $this->isEnabled();
        if (!$smsOn && !AlertSwitch::isOn('staff_new_customer')) {
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
                emailOnly: !$smsOn,
            );
        }
    }

    /**
     * Recipients for new customer alerts (re-audit, 2026-10-10):
     * 1. Whoever "Staff: new customer" goes to in Admin → Notifications
     *    (owners and managers by default; the migration kept the fallback
     *    staff who got it before)
     * 2. Active external SmsContacts (on-call numbers)
     */
    private function resolveRecipients(): \Illuminate\Support\Collection
    {
        $audience = AlertAudience::for('staff_new_customer') ?? AlertAudience::normalize([]);
        $typed = [...$audience['phones'], ...array_map(fn (string $e) => AlertAudience::EMAIL_PREFIX . $e, $audience['emails'])];
        $recipients = AlertAudience::addresses('staff_new_customer')->map(function (string $to) use ($typed) {
            $person = in_array($to, $typed, true) ? null : NotificationChannels::personFor($to);

            return [
                'phone' => $to,
                'recipient_type' => $person !== null ? 'staff' : 'contact',
                'recipient_id' => $person?->id,
            ];
        });

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

        return $recipients->merge($externalContacts)->unique('phone')->values();
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
