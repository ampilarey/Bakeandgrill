<?php

declare(strict_types=1);

namespace App\Domains\Customers\Services;

use App\Domains\Customers\Support\CustomerPaidOrderQuery;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\CustomerFollowUpNote;
use App\Models\LoyaltyLedger;
use App\Models\Order;
use App\Models\Referral;
use App\Models\Review;
use App\Models\SmsLog;

final class CustomerActivityService
{
    /** @return list<array{type: string, title: string, description: string, amount: ?float, staff: ?string, created_at: string, source_id: ?int}> */
    public function timeline(Customer $customer, int $limit = 100): array
    {
        $events = [];

        $events[] = [
            'type' => 'customer_created',
            'title' => 'Customer joined',
            'description' => 'Account created',
            'amount' => null,
            'staff' => null,
            'created_at' => $customer->created_at?->toIso8601String() ?? now()->toIso8601String(),
            'source_id' => $customer->id,
        ];

        CustomerPaidOrderQuery::apply($customer->orders())
            ->select('id', 'order_number', 'total', 'paid_at', 'type')
            ->orderByDesc('paid_at')
            ->limit(50)
            ->get()
            ->each(function (Order $order) use (&$events): void {
                $events[] = [
                    'type' => 'order_paid',
                    'title' => 'Order paid',
                    'description' => "#{$order->order_number} ({$order->type})",
                    'amount' => (float) $order->total,
                    'staff' => null,
                    'created_at' => $order->paid_at?->toIso8601String() ?? $order->created_at?->toIso8601String(),
                    'source_id' => $order->id,
                ];
            });

        $customer->orders()
            ->where('status', 'cancelled')
            ->select('id', 'order_number', 'total', 'cancelled_at', 'created_at')
            ->orderByDesc('cancelled_at')
            ->limit(20)
            ->get()
            ->each(function (Order $order) use (&$events): void {
                $events[] = [
                    'type' => 'order_cancelled',
                    'title' => 'Order cancelled',
                    'description' => "#{$order->order_number}",
                    'amount' => (float) $order->total,
                    'staff' => null,
                    'created_at' => ($order->cancelled_at ?? $order->created_at)?->toIso8601String(),
                    'source_id' => $order->id,
                ];
            });

        Review::where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get()
            ->each(function (Review $review) use (&$events): void {
                $events[] = [
                    'type' => 'review',
                    'title' => 'Review submitted',
                    'description' => "{$review->rating}/5 — " . mb_substr((string) ($review->comment ?? ''), 0, 80),
                    'amount' => null,
                    'staff' => null,
                    'created_at' => $review->created_at?->toIso8601String(),
                    'source_id' => $review->id,
                ];
            });

        SmsLog::where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(30)
            ->get()
            ->each(function (SmsLog $log) use (&$events): void {
                $events[] = [
                    'type' => 'sms',
                    'title' => 'SMS ' . $log->status,
                    'description' => mb_substr($log->message ?? $log->type, 0, 80),
                    'amount' => null,
                    'staff' => null,
                    'created_at' => $log->created_at?->toIso8601String(),
                    'source_id' => $log->id,
                ];
            });

        LoyaltyLedger::where('customer_id', $customer->id)
            ->orderByDesc('occurred_at')
            ->limit(30)
            ->get()
            ->each(function (LoyaltyLedger $entry) use (&$events): void {
                $events[] = [
                    'type' => 'loyalty',
                    'title' => ucfirst(str_replace('_', ' ', $entry->type)),
                    'description' => $entry->notes ?? $entry->type,
                    'amount' => (float) $entry->points,
                    'staff' => null,
                    'created_at' => ($entry->occurred_at ?? $entry->created_at)?->toIso8601String(),
                    'source_id' => $entry->id,
                ];
            });

        CustomerCreditLedger::where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(30)
            ->get()
            ->each(function (CustomerCreditLedger $entry) use (&$events): void {
                $events[] = [
                    'type' => 'credit',
                    'title' => ucfirst(str_replace('_', ' ', $entry->type)),
                    'description' => $entry->notes ?? $entry->type,
                    'amount' => round($entry->amount_laar / 100, 2),
                    'staff' => null,
                    'created_at' => $entry->created_at?->toIso8601String(),
                    'source_id' => $entry->id,
                ];
            });

        Referral::where('referee_customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(10)
            ->get()
            ->each(function (Referral $ref) use (&$events): void {
                $events[] = [
                    'type' => 'referral',
                    'title' => 'Referral used',
                    'description' => 'Referral redemption recorded',
                    'amount' => null,
                    'staff' => null,
                    'created_at' => $ref->created_at?->toIso8601String(),
                    'source_id' => $ref->id,
                ];
            });

        AuditLog::where('model_type', Customer::class)
            ->where('model_id', $customer->id)
            ->whereIn('action', ['customer.phone_changed', 'customer.accounts_merged'])
            ->with('user:id,name')
            ->orderByDesc('created_at')
            ->limit(20)
            ->get()
            ->each(function (AuditLog $log) use (&$events): void {
                $events[] = [
                    'type' => $log->action === 'customer.phone_changed' ? 'phone_changed' : 'accounts_merged',
                    'title' => $log->action === 'customer.phone_changed' ? 'Phone changed' : 'Accounts merged',
                    'description' => json_encode($log->new_values ?? []),
                    'amount' => null,
                    'staff' => $log->user?->name,
                    'created_at' => $log->created_at?->toIso8601String(),
                    'source_id' => $log->id,
                ];
            });

        CustomerFollowUpNote::where('customer_id', $customer->id)
            ->with('staff:id,name')
            ->orderByDesc('created_at')
            ->limit(20)
            ->get()
            ->each(function (CustomerFollowUpNote $note) use (&$events): void {
                $events[] = [
                    'type' => 'follow_up_note',
                    'title' => 'Follow-up note',
                    'description' => mb_substr($note->note, 0, 120),
                    'amount' => null,
                    'staff' => $note->staff?->name,
                    'created_at' => $note->created_at?->toIso8601String(),
                    'source_id' => $note->id,
                ];
            });

        usort($events, fn ($a, $b) => strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''));

        return array_slice($events, 0, $limit);
    }
}
