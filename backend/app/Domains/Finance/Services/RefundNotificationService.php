<?php

declare(strict_types=1);

namespace App\Domains\Finance\Services;

use App\Domains\Auth\Services\ApprovalOtpCoder;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Order;
use App\Models\Refund;
use App\Models\SmsTemplate;
use App\Models\User;
use App\Rules\MaldivesPhone;
use App\Services\PermissionService;
use Illuminate\Support\Facades\Log;

class RefundNotificationService
{
    public function __construct(
        private readonly SmsService $sms,
        private readonly ApprovalOtpCoder $otp,
    ) {}

    /** Phone already stored on the order / linked customer — never a client override. */
    public function resolveOrderContactPhone(Order $order): ?string
    {
        $order->loadMissing('customer');
        $raw = $order->delivery_contact_phone
            ?: ($order->customer?->phone ?? null);
        $raw = is_string($raw) ? trim($raw) : '';
        if ($raw === '') {
            return null;
        }

        return MaldivesPhone::normalize($raw);
    }

    /** Prefer the immutable refund_phone snapshot; fall back to order phone for legacy rows. */
    public function resolveRefundPhone(Refund $refund): ?string
    {
        $stored = is_string($refund->refund_phone) ? trim($refund->refund_phone) : '';
        if ($stored !== '') {
            return MaldivesPhone::normalize($stored);
        }
        $order = $refund->order;
        if (! $order) {
            return null;
        }

        return $this->resolveOrderContactPhone($order);
    }

    public function notifyCustomerRequested(Refund $refund): void
    {
        $order = $refund->order;
        $phone = $this->resolveRefundPhone($refund);
        if (! $order || $phone === null) {
            return;
        }

        $body = $this->renderTemplate('customer_refund_requested', [
            'order_number' => $order->order_number ?? (string) $order->id,
        ], "Bake & Grill: a refund has been requested on order {$order->order_number}. We will message you again when it is processed.");

        $this->sms->send(new SmsMessage(
            to: $phone,
            message: $body,
            type: 'customer_refund_requested',
            customerId: $order->customer_id,
            referenceType: 'refund',
            referenceId: (string) $refund->id,
            idempotencyKey: 'refund-requested:'.$refund->id,
        ));
    }

    public function notifyCustomerCompleted(Refund $refund): void
    {
        $order = $refund->order;
        $phone = $this->resolveRefundPhone($refund);
        if (! $order || $phone === null) {
            return;
        }

        $body = $this->renderTemplate('customer_refund_completed', [
            'order_number' => $order->order_number ?? (string) $order->id,
        ], "Bake & Grill: your refund on order {$order->order_number} has been processed.");

        $this->sms->send(new SmsMessage(
            to: $phone,
            message: $body,
            type: 'customer_refund_completed',
            customerId: $order->customer_id,
            referenceType: 'refund',
            referenceId: (string) $refund->id,
            idempotencyKey: 'refund-completed:'.$refund->id,
        ));
    }

    /**
     * Send customer OTP using the shared ApprovalOtpCoder (same TTL / length as discount approval).
     *
     * @return array{plain: string, ttl_minutes: int}
     */
    public function issueAndSendOtp(Refund $refund): array
    {
        $phone = $this->resolveRefundPhone($refund);
        if ($phone === null) {
            abort(422, 'A phone number is required before a verification code can be sent.');
        }

        $issued = $this->otp->issue();
        $order = $refund->order;
        $orderLabel = $order?->order_number ?? (string) $refund->order_id;

        $refund->forceFill([
            'otp_code_hash' => $issued['hash'],
            'otp_expires_at' => $issued['expires_at'],
            'otp_attempts' => 0,
            'otp_verified_at' => null,
            'otp_owner_override' => false,
            'otp_sent_at' => now(),
        ])->save();

        $fallback = "Bake & Grill: code {$issued['plain']} confirms a refund on order {$orderLabel}. Tell the cashier this code. Expires in {$issued['ttl_minutes']} min.";
        $body = $this->renderTemplate('customer_refund_otp', [
            'code' => $issued['plain'],
            'order_number' => $orderLabel,
            'minutes' => (string) $issued['ttl_minutes'],
        ], $fallback);

        $log = $this->sms->send(new SmsMessage(
            to: $phone,
            message: $body,
            type: 'customer_refund_otp',
            customerId: $order?->customer_id,
            referenceType: 'refund',
            referenceId: (string) $refund->id,
            idempotencyKey: 'refund-otp:'.$refund->id.':'.$issued['expires_at']->timestamp,
        ));

        if (! in_array($log->status, ['sent', 'demo', 'queued'], true)) {
            abort(422, 'Could not send the verification SMS. An owner can override if the customer has no local SIM.');
        }

        // Never return the plaintext code to API clients in production paths —
        // tests may inspect SMS mock captures instead.
        return [
            'plain' => $issued['plain'],
            'ttl_minutes' => $issued['ttl_minutes'],
        ];
    }

    public function notifyApprovers(Refund $refund, User $requester): void
    {
        $order = $refund->order;
        $perms = app(PermissionService::class);
        $approvers = User::query()
            ->where('is_active', true)
            ->with(['role.permissions', 'permissions'])
            ->get()
            ->filter(fn (User $u) => $perms->hasPermission($u, 'orders.refund'))
            ->filter(fn (User $u) => (int) $u->id !== (int) $requester->id);

        $amount = number_format((float) $refund->amount, 2);
        $orderNumber = $order?->order_number ?? (string) $refund->order_id;
        $phone = $this->resolveRefundPhone($refund) ?? 'unknown';
        $body = $this->renderTemplate('staff_refund_requested', [
            'order_number' => $orderNumber,
            'amount' => $amount,
            'phone' => $phone,
        ], "Refund request on {$orderNumber} for MVR {$amount} (phone {$phone}) needs approval. Open Refunds in admin.");

        foreach ($approvers as $approver) {
            $to = trim((string) ($approver->phone ?? ''));
            if ($to === '') {
                continue;
            }
            try {
                $this->sms->send(new SmsMessage(
                    to: $to,
                    message: $body,
                    type: 'staff_refund_requested',
                    referenceType: 'refund',
                    referenceId: (string) $refund->id,
                    idempotencyKey: 'refund-approver:'.$refund->id.':'.$approver->id,
                ));
            } catch (\Throwable $e) {
                Log::warning('RefundNotificationService: approver SMS failed', [
                    'refund_id' => $refund->id,
                    'user_id' => $approver->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    /** @param  array<string, string>  $vars */
    private function renderTemplate(string $slug, array $vars, string $fallback): string
    {
        $template = SmsTemplate::query()->where('slug', $slug)->first();
        $body = $template?->body ?: $fallback;
        foreach ($vars as $key => $value) {
            $body = str_replace('{{'.$key.'}}', $value, $body);
        }

        return $body;
    }
}
