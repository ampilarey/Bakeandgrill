<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Receipt;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Public invoice page view-model (plan §8) — payment routing by type,
 * credit-aware balance, overdue-by-days, trade deliveries, payment history.
 */
class InvoicePagePresenter
{
    /**
     * @return array{
     *   display_balance_laar: int,
     *   display_balance_mvr: float,
     *   credit_notes_total_laar: int,
     *   credit_notes: list<array{number:string,reason:?string,total_mvr:float,status:string}>,
     *   overdue_days: ?int,
     *   pay_cta: ?array{kind:string,href:string,label:string},
     *   payment_history: list<array{date:string,method:string,status:string,amount_mvr:float}>,
     *   deliveries: list<array{date:string,reference:string,lines:list<array{label:string,qty:int,amount_mvr:float,kind:string}>}>
     * }
     */
    public static function present(Invoice $invoice): array
    {
        $invoice->loadMissing([
            'order.payments',
            'payments',
            'creditNotes',
            'tradeAllocations.deliveryLine.delivery',
            'tradeAllocations.deliveryLine.item',
        ]);

        $creditNotes = $invoice->creditNotes
            ->filter(fn (Invoice $cn) => $cn->type === 'credit_note'
                && ! in_array($cn->status, ['void', 'cancelled'], true));

        $creditTotalLaar = (int) $creditNotes->sum(function (Invoice $cn) {
            return (int) ($cn->total_laar ?? round((float) $cn->total * 100));
        });

        $rawBalance = $invoice->balanceDueLaar();
        if (in_array($invoice->status, ['void', 'cancelled', 'paid'], true) || $invoice->type === 'credit_note') {
            $displayBalanceLaar = 0;
        } else {
            $displayBalanceLaar = max(0, $rawBalance - $creditTotalLaar);
        }

        $overdueDays = self::overdueDays($invoice, $displayBalanceLaar);
        $payCta = self::payCta($invoice, $displayBalanceLaar);

        return [
            'display_balance_laar' => $displayBalanceLaar,
            'display_balance_mvr' => $displayBalanceLaar / 100,
            'credit_notes_total_laar' => $creditTotalLaar,
            'credit_notes' => $creditNotes->map(fn (Invoice $cn) => [
                'number' => (string) $cn->invoice_number,
                'reason' => $cn->credit_note_reason,
                'total_mvr' => ((int) ($cn->total_laar ?? round((float) $cn->total * 100))) / 100,
                'status' => (string) $cn->status,
            ])->values()->all(),
            'overdue_days' => $overdueDays,
            'pay_cta' => $payCta,
            'payment_history' => self::paymentHistory($invoice),
            'deliveries' => self::deliveries($invoice),
        ];
    }

    private static function overdueDays(Invoice $invoice, int $displayBalanceLaar): ?int
    {
        if ($displayBalanceLaar <= 0) {
            return null;
        }
        if (in_array($invoice->status, ['paid', 'void', 'cancelled'], true)) {
            return null;
        }
        if (! $invoice->due_date) {
            return null;
        }

        $due = Carbon::parse($invoice->due_date)->startOfDay();
        $today = now()->startOfDay();
        if ($today->lessThanOrEqualTo($due)) {
            return null;
        }

        return (int) $due->diffInDays($today);
    }

    /**
     * @return ?array{kind:string,href:string,label:string}
     */
    private static function payCta(Invoice $invoice, int $displayBalanceLaar): ?array
    {
        if ($displayBalanceLaar <= 0) {
            return null;
        }
        if (in_array($invoice->status, ['paid', 'void', 'cancelled'], true)) {
            return null;
        }
        if (in_array($invoice->type, ['purchase', 'credit_note'], true)) {
            return null;
        }

        // Trade receivable — authenticated portal only (TradeReceivablePaymentService).
        if ($invoice->trade_account_id) {
            return [
                'kind' => 'trade',
                'href' => url('/order/account/statement'),
                'label' => 'Pay in trade account',
            ];
        }

        // Sale invoice against an unpaid order — existing order/receipt pay page.
        if ($invoice->type === 'sale' && $invoice->order_id && $invoice->order) {
            if ($invoice->isOnCreditAccount()) {
                return null;
            }
            $receipt = Receipt::ensureForOrder($invoice->order);

            return [
                'kind' => 'sale',
                'href' => $receipt->posPayPageUrl(),
                'label' => 'Pay this invoice',
            ];
        }

        return null;
    }

    /**
     * @return list<array{date:string,method:string,status:string,amount_mvr:float}>
     */
    private static function paymentHistory(Invoice $invoice): array
    {
        /** @var Collection<int, Payment> $payments */
        if ($invoice->trade_account_id) {
            $payments = $invoice->payments;
        } elseif ($invoice->order) {
            // Sale: order payments only — avoid double-counting synced invoice payments.
            $payments = $invoice->order->payments;
        } else {
            $payments = $invoice->payments;
        }

        return $payments
            ->sortBy(fn (Payment $p) => $p->processed_at?->timestamp ?? $p->created_at?->timestamp ?? 0)
            ->values()
            ->map(function (Payment $p) {
                $amount = $p->amount_laar !== null
                    ? ((int) $p->amount_laar) / 100
                    : (float) $p->amount;

                return [
                    'date' => optional($p->processed_at ?? $p->created_at)->format('d M Y') ?? '—',
                    'method' => (string) ($p->method ?: '—'),
                    'status' => (string) ($p->status ?: '—'),
                    'amount_mvr' => $amount,
                ];
            })
            ->all();
    }

    /**
     * @return list<array{date:string,reference:string,lines:list<array{label:string,qty:int,amount_mvr:float,kind:string}>}>
     */
    private static function deliveries(Invoice $invoice): array
    {
        if (! $invoice->trade_account_id) {
            return [];
        }

        $groups = [];
        foreach ($invoice->tradeAllocations as $alloc) {
            $line = $alloc->deliveryLine;
            $delivery = $line?->delivery;
            if (! $delivery) {
                continue;
            }
            $ref = (string) ($delivery->delivery_number ?: 'Delivery #'.$delivery->id);
            $date = optional($delivery->dispatched_at ?? $delivery->created_at)->format('d M Y') ?? '—';
            $key = $date.'|'.$ref;
            if (! isset($groups[$key])) {
                $groups[$key] = [
                    'date' => $date,
                    'reference' => $ref,
                    'lines' => [],
                ];
            }
            $itemName = $line->item?->name ?? 'Item';
            $groups[$key]['lines'][] = [
                'label' => $itemName,
                'qty' => (int) $alloc->qty_invoiced,
                'amount_mvr' => ((int) $alloc->amount_laar) / 100,
                'kind' => (string) $alloc->line_kind,
            ];
        }

        return array_values($groups);
    }
}
