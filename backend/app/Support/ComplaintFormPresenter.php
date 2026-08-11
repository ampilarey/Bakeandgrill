<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Complaint;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Receipt;
use App\Models\SiteSetting;
use Illuminate\Support\Carbon;

final class ComplaintFormPresenter
{
    /**
     * @return array{
     *   categories: list<array{value: string, label: string}>,
     *   items: list<array{id: int, name: string}>,
     *   window_closed: ?string,
     *   endpoint: string,
     *   existing_complaints: list<array<string, mixed>>,
     *   open_count: int,
     *   open_cap: int,
     *   at_open_cap: bool,
     *   can_submit_another: bool
     * }
     */
    public static function forReceipt(Receipt $receipt): array
    {
        $order = $receipt->order;
        $categories = self::receiptCategories($order);
        $items = [];
        foreach ($order?->items ?? [] as $item) {
            if ($item->parent_order_item_id) {
                continue;
            }
            $items[] = [
                'id' => (int) $item->id,
                'name' => (string) ($item->item_name ?? 'Item'),
            ];
        }

        $existing = self::existingForReceipt($receipt);
        $openCap = max(1, (int) SiteSetting::get('complaint_open_cap_per_receipt', 3));
        $openCount = Complaint::query()
            ->where('receipt_id', $receipt->id)
            ->whereNotIn('status', Complaint::CLOSED_STATUSES)
            ->count();
        $atCap = $openCount >= $openCap;

        return [
            'categories' => $categories,
            'items' => $items,
            'window_closed' => self::anyWindowClosedMessage($order),
            'endpoint' => url('/api/receipts/'.$receipt->token.'/complaints'),
            'existing_complaints' => $existing,
            'open_count' => $openCount,
            'open_cap' => $openCap,
            'at_open_cap' => $atCap,
            'can_submit_another' => ! $atCap,
        ];
    }

    /**
     * @return array{
     *   categories: list<array{value: string, label: string}>,
     *   items: list<array{id: int, name: string}>,
     *   window_closed: ?string,
     *   endpoint: string,
     *   existing_complaints: list<array<string, mixed>>,
     *   open_count: int,
     *   open_cap: int,
     *   at_open_cap: bool,
     *   can_submit_another: bool
     * }
     */
    public static function forInvoice(Invoice $invoice): array
    {
        $categories = [];
        foreach (Complaint::INVOICE_CATEGORIES as $cat) {
            $categories[] = ['value' => $cat, 'label' => Complaint::categoryLabel($cat)];
        }

        $existing = self::existingForInvoice($invoice);

        return [
            'categories' => $categories,
            'items' => [],
            'window_closed' => self::windowClosedForCategory(
                Complaint::CATEGORY_BILL_WRONG_AMOUNT,
                $invoice->issue_date ?? $invoice->created_at ?? now(),
            ),
            'endpoint' => url('/api/invoices/'.$invoice->token.'/complaints'),
            'existing_complaints' => $existing,
            'open_count' => 0,
            'open_cap' => 0,
            'at_open_cap' => false,
            'can_submit_another' => true,
        ];
    }

    /** @return list<array<string, mixed>> */
    public static function existingForReceipt(Receipt $receipt): array
    {
        return Complaint::query()
            ->where('receipt_id', $receipt->id)
            ->where(function ($q) {
                $q->whereNotIn('status', Complaint::CLOSED_STATUSES)
                    ->orWhere('resolved_at', '>=', now()->subDays(30))
                    ->orWhere(function ($q2) {
                        $q2->whereIn('status', Complaint::CLOSED_STATUSES)
                            ->where('updated_at', '>=', now()->subDays(30));
                    });
            })
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn (Complaint $c) => $c->toPublicSummary())
            ->all();
    }

    /** @return list<array<string, mixed>> */
    public static function existingForInvoice(Invoice $invoice): array
    {
        return Complaint::query()
            ->where('invoice_id', $invoice->id)
            ->where(function ($q) {
                $q->whereNotIn('status', Complaint::CLOSED_STATUSES)
                    ->orWhere('resolved_at', '>=', now()->subDays(30))
                    ->orWhere(function ($q2) {
                        $q2->whereIn('status', Complaint::CLOSED_STATUSES)
                            ->where('updated_at', '>=', now()->subDays(30));
                    });
            })
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn (Complaint $c) => $c->toPublicSummary())
            ->all();
    }

    /** @return list<array{value: string, label: string}> */
    private static function receiptCategories(?Order $order): array
    {
        $out = [];
        foreach (Complaint::RECEIPT_CATEGORIES as $cat) {
            if ($cat === Complaint::CATEGORY_DELIVERY && ($order?->type ?? '') !== 'delivery') {
                continue;
            }
            $out[] = ['value' => $cat, 'label' => Complaint::categoryLabel($cat)];
        }

        return $out;
    }

    private static function anyWindowClosedMessage(?Order $order): ?string
    {
        if (! $order) {
            return null;
        }
        $anchor = $order->paid_at ?? $order->created_at ?? now();
        // Only hide the form when BOTH windows are closed.
        $foodClosed = self::windowClosedForCategory(Complaint::CATEGORY_FOOD_QUALITY, $anchor);
        $billClosed = self::windowClosedForCategory(Complaint::CATEGORY_WRONG_AMOUNT, $anchor);
        if ($foodClosed && $billClosed) {
            return 'The complaint window for this order has closed.';
        }

        return null;
    }

    public static function windowHoursForCategory(string $category): int
    {
        $billing = Complaint::isBillingCategory($category);

        return max(0, (int) SiteSetting::get(
            $billing ? 'complaint_window_billing_hours' : 'complaint_window_food_hours',
            $billing ? 720 : 48,
        ));
    }

    /** @param  list<string>  $categories */
    public static function longestWindowHours(array $categories): int
    {
        $max = 0;
        foreach ($categories as $cat) {
            $max = max($max, self::windowHoursForCategory($cat));
        }

        return $max;
    }

    private static function windowClosedForCategory(string $category, mixed $anchor): ?string
    {
        $hours = self::windowHoursForCategory($category);
        if ($hours <= 0) {
            return null;
        }
        $from = $anchor instanceof \DateTimeInterface ? Carbon::parse($anchor) : now();
        if ($from->diffInMinutes(now()) <= $hours * 60) {
            return null;
        }

        return Complaint::isBillingCategory($category)
            ? 'The billing complaint window for this document has closed.'
            : 'The complaint window for food and service issues has closed for this order.';
    }
}
