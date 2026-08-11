<?php

declare(strict_types=1);

namespace App\Domains\Complaints\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\SmsLog;
use App\Models\SmsTemplate;
use App\Models\User;
use App\Rules\MaldivesPhone;
use Illuminate\Support\Facades\Log;

/**
 * Complaint SMS — refund-pattern sibling. Does NOT use StaffNotificationDispatcher.
 */
class ComplaintNotificationService
{
    public function __construct(
        private readonly SmsService $sms,
    ) {}

    public function notifyOpened(Complaint $complaint): void
    {
        $complaint->loadMissing(['order.customer', 'customer']);

        $this->notifyOwner($complaint);
        $this->notifyCustomerAcknowledged($complaint);
    }

    public function notifyResolved(Complaint $complaint): void
    {
        $complaint->loadMissing(['order.customer', 'customer']);
        $this->notifyCustomerResolved($complaint);
    }

    public function notifyOwner(Complaint $complaint): void
    {
        $owners = User::query()
            ->whereHas('role', fn ($q) => $q->where('slug', 'owner'))
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->get();

        if ($owners->isEmpty()) {
            $complaint->update([
                'owner_alert_status' => Complaint::OWNER_ALERT_FAILED,
                'owner_alert_detail' => 'No owner phone on file.',
            ]);

            return;
        }

        $orderNumber = $complaint->order?->order_number ?? (string) ($complaint->order_id ?? 'n/a');
        $categoryLabel = Complaint::categoryLabel($complaint->category);
        $urgent = (bool) $complaint->is_food_safety;
        $slug = $urgent ? 'owner_complaint_received_urgent' : 'owner_complaint_received';
        $default = $urgent
            ? "URGENT food safety/allergy complaint {$complaint->reference_number} on order {$orderNumber}. Open Complaints in admin now."
            : "Complaint {$complaint->reference_number} on order {$orderNumber}: {$categoryLabel}. Open Complaints in admin.";

        $body = $this->renderTemplate($slug, [
            'reference' => $complaint->reference_number,
            'order_number' => $orderNumber,
            'category' => $categoryLabel,
        ], $default);

        $anySent = false;
        $anyFailed = false;
        $details = [];

        foreach ($owners as $owner) {
            $rawPhone = trim((string) $owner->phone);
            if ($rawPhone === '') {
                continue;
            }
            $to = MaldivesPhone::normalize($rawPhone);

            try {
                $log = $this->sms->send(new SmsMessage(
                    to: $to,
                    message: $body,
                    type: 'owner_complaint_received',
                    referenceType: 'complaint',
                    referenceId: (string) $complaint->id,
                    idempotencyKey: 'complaint-owner:'.$complaint->id.':'.$owner->id,
                ));
                $status = (string) ($log->status ?? '');
                if (in_array($status, ['sent', 'demo', 'queued'], true)) {
                    $anySent = true;
                } elseif ($status === 'disabled' || $status === 'suppressed') {
                    $details[] = "owner {$owner->id}: {$status}";
                } else {
                    $anyFailed = true;
                    $details[] = "owner {$owner->id}: {$status}";
                }
            } catch (\Throwable $e) {
                $anyFailed = true;
                $details[] = "owner {$owner->id}: ".$e->getMessage();
                Log::warning('complaint.owner_sms_failed', [
                    'complaint_id' => $complaint->id,
                    'owner_id' => $owner->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $prev = $complaint->owner_alert_status;
        if ($anySent) {
            $complaint->update([
                'owner_alert_status' => $prev === Complaint::OWNER_ALERT_FAILED
                    ? Complaint::OWNER_ALERT_RETRIED
                    : Complaint::OWNER_ALERT_SENT,
                'owner_alert_detail' => $details === [] ? null : implode('; ', $details),
            ]);
        } elseif ($details !== [] && ! $anyFailed) {
            $complaint->update([
                'owner_alert_status' => Complaint::OWNER_ALERT_SUPPRESSED,
                'owner_alert_detail' => implode('; ', $details),
            ]);
        } else {
            $complaint->update([
                'owner_alert_status' => Complaint::OWNER_ALERT_FAILED,
                'owner_alert_detail' => $details === [] ? 'Owner SMS could not be sent.' : implode('; ', $details),
            ]);
        }
    }

    public function notifyCustomerAcknowledged(Complaint $complaint): void
    {
        $this->sendCustomerMessage(
            $complaint,
            'customer_complaint_acknowledged',
            'customer_complaint_acknowledged',
            "Bake & Grill: we received your concern ({$complaint->reference_number}). We will look into it.",
            'complaint-ack:'.$complaint->id,
        );
    }

    public function notifyCustomerResolved(Complaint $complaint): void
    {
        $this->sendCustomerMessage(
            $complaint,
            'customer_complaint_resolved',
            'customer_complaint_resolved',
            "Bake & Grill: your concern {$complaint->reference_number} has been resolved. Thank you for telling us.",
            'complaint-resolved:'.$complaint->id,
        );
    }

    private function sendCustomerMessage(
        Complaint $complaint,
        string $templateSlug,
        string $type,
        string $defaultBody,
        string $idempotencyKey,
    ): void {
        $customer = $complaint->customer ?? $complaint->order?->customer;
        if ($customer instanceof Customer && $customer->sms_opt_out) {
            return;
        }

        $phone = $this->resolveCustomerPhone($complaint);
        if ($phone === null) {
            return;
        }

        $body = $this->renderTemplate($templateSlug, [
            'reference' => $complaint->reference_number,
        ], $defaultBody);

        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $body,
                type: $type,
                customerId: $complaint->customer_id ?? $complaint->order?->customer_id,
                referenceType: 'complaint',
                referenceId: (string) $complaint->id,
                idempotencyKey: $idempotencyKey,
            ));
        } catch (\Throwable $e) {
            Log::warning('complaint.customer_sms_failed', [
                'complaint_id' => $complaint->id,
                'type' => $type,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function resolveCustomerPhone(Complaint $complaint): ?string
    {
        $order = $complaint->order;
        $raw = $order?->delivery_contact_phone
            ?: ($complaint->customer?->phone ?? $order?->customer?->phone ?? null);
        $raw = is_string($raw) ? trim($raw) : '';
        if ($raw === '') {
            return null;
        }

        return MaldivesPhone::normalize($raw);
    }

    public function customerHasUsableContact(Complaint $complaint): bool
    {
        $customer = $complaint->customer ?? $complaint->order?->customer;
        if ($customer instanceof Customer && $customer->sms_opt_out) {
            return false;
        }

        return $this->resolveCustomerPhone($complaint) !== null;
    }

    /** @param array<string, string> $vars */
    private function renderTemplate(string $slug, array $vars, string $fallback): string
    {
        $tpl = SmsTemplate::query()->where('slug', $slug)->first();
        $body = is_string($tpl?->body) && trim($tpl->body) !== '' ? $tpl->body : $fallback;
        foreach ($vars as $key => $value) {
            $body = str_replace('{{'.$key.'}}', (string) $value, $body);
        }

        return $body;
    }
}
