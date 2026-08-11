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
     *   endpoint: string
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

        return [
            'categories' => $categories,
            'items' => $items,
            'window_closed' => self::anyWindowClosedMessage($order),
            'endpoint' => url('/api/receipts/'.$receipt->token.'/complaints'),
        ];
    }

    /**
     * @return array{
     *   categories: list<array{value: string, label: string}>,
     *   items: list<array{id: int, name: string}>,
     *   window_closed: ?string,
     *   endpoint: string
     * }
     */
    public static function forInvoice(Invoice $invoice): array
    {
        $categories = [];
        foreach (Complaint::INVOICE_CATEGORIES as $cat) {
            $categories[] = ['value' => $cat, 'label' => Complaint::categoryLabel($cat)];
        }

        return [
            'categories' => $categories,
            'items' => [],
            'window_closed' => self::windowClosedForCategory(
                Complaint::CATEGORY_BILL_WRONG_AMOUNT,
                $invoice->issue_date ?? $invoice->created_at ?? now(),
            ),
            'endpoint' => url('/api/invoices/'.$invoice->token.'/complaints'),
        ];
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

    private static function windowClosedForCategory(string $category, mixed $anchor): ?string
    {
        $billing = in_array($category, [
            Complaint::CATEGORY_WRONG_AMOUNT,
            Complaint::CATEGORY_BILL_WRONG_AMOUNT,
            Complaint::CATEGORY_BILL_WRONG_ITEMS,
            Complaint::CATEGORY_BILL_ALREADY_PAID,
        ], true);
        $hours = max(0, (int) SiteSetting::get(
            $billing ? 'complaint_window_billing_hours' : 'complaint_window_food_hours',
            $billing ? 720 : 48,
        ));
        if ($hours <= 0) {
            return null;
        }
        $from = $anchor instanceof \DateTimeInterface ? Carbon::parse($anchor) : now();
        if ($from->diffInMinutes(now()) <= $hours * 60) {
            return null;
        }

        return $billing
            ? 'The billing complaint window for this document has closed.'
            : 'The complaint window for food and service issues has closed for this order.';
    }
}
