<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Domains\Credit\Services\CreditLedgerService;
use App\Domains\Gst\Services\GstInvoiceSequenceService;
use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Shared\ValueObjects\Money;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\TaxLedgerEntry;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\TradeInvoiceAllocation;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Stage D — raise a trade tax invoice for reconciled (or firm-sale) deliveries.
 * Invoice + items + allocations + ledger charge + GST in ONE transaction.
 */
final class TradeInvoiceService
{
    public function __construct(
        private readonly TradeCreditExposureService $exposure,
        private readonly CreditLedgerService $ledger,
        private readonly GstLedgerPoster $gstPoster,
        private readonly GstInvoiceSequenceService $gstSequence,
        private readonly GstSettingsService $gstSettings,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param  list<int>  $deliveryIds
     */
    public function raise(
        TradeAccount $account,
        array $deliveryIds,
        User $actor,
        string $idempotencyKey,
        ?string $notes = null,
    ): Invoice {
        $existing = Invoice::where('idempotency_key', $idempotencyKey)->first();
        if ($existing) {
            return $existing->load(['items', 'customer', 'tradeAccount']);
        }

        if ($deliveryIds === []) {
            throw ValidationException::withMessages(['delivery_ids' => ['Pick at least one delivery.']]);
        }

        $account->loadMissing('customer');
        $customer = $account->customer;
        if ($customer === null) {
            abort(422, 'Trade account has no customer.');
        }

        // Payment / hybrid basis needs the payment-path poster. If that is
        // unavailable we refuse — never silently skip output tax.
        if ($this->gstPoster->shouldPostOrderOnPayment() && ! $this->gstPoster->canPostTradeInvoiceOnPayment()) {
            abort(422, 'Cannot raise a wholesale invoice: GST is on payment basis and trade-invoice payment posting is not available. Fix GST settings or contact support.');
        }

        return DB::transaction(function () use ($account, $deliveryIds, $actor, $idempotencyKey, $notes, $customer) {
            $again = Invoice::where('idempotency_key', $idempotencyKey)->lockForUpdate()->first();
            if ($again) {
                return $again->load(['items', 'customer', 'tradeAccount']);
            }

            Customer::lockForUpdate()->findOrFail($customer->id);

            $deliveries = TradeDelivery::query()
                ->where('trade_account_id', $account->id)
                ->whereIn('id', $deliveryIds)
                ->with(['lines.item', 'lines.variant', 'tradeAccount'])
                ->lockForUpdate()
                ->get();

            if ($deliveries->count() !== count(array_unique($deliveryIds))) {
                abort(422, 'One or more deliveries were not found for this shop.');
            }

            foreach ($deliveries as $delivery) {
                $this->assertInvoiceable($delivery, $account);
            }

            $built = $this->buildLinesAndAllocations($deliveries, $account);
            if ($built['allocations'] === []) {
                abort(422, 'Nothing left to invoice on the selected deliveries.');
            }

            $taxRateBp = $this->gstSettings->defaultTaxRateBp();
            $totalInclusiveLaar = $built['total_laar'];
            $taxLaar = (new Money($totalInclusiveLaar))->extractTax($taxRateBp)->amountLaar;
            $subtotalLaar = $totalInclusiveLaar - $taxLaar;

            $termsDays = $account->resolvedPaymentTermsDays();
            $issueDate = now()->toDateString();
            $dueDate = Carbon::parse($issueDate)->addDays($termsDays)->toDateString();

            $invoice = Invoice::create([
                'invoice_number' => $this->gstSequence->nextTaxInvoiceNumber(),
                'idempotency_key' => $idempotencyKey,
                'type' => 'sale',
                'status' => 'sent',
                'is_tax_invoice' => true,
                'customer_id' => $customer->id,
                'trade_account_id' => $account->id,
                'created_by' => $actor->id,
                'recipient_name' => $account->shop_name ?: $customer->name,
                'recipient_phone' => $account->contact_phone ?: $customer->phone,
                'recipient_address' => $customer->billing_address,
                'customer_tin' => $customer->tin,
                'subtotal_laar' => $subtotalLaar,
                'tax_laar' => $taxLaar,
                'discount_laar' => 0,
                'total_laar' => $totalInclusiveLaar,
                'amount_paid_laar' => 0,
                'subtotal' => round($subtotalLaar / 100, 2),
                'tax_amount' => round($taxLaar / 100, 2),
                'discount_amount' => 0,
                'total' => round($totalInclusiveLaar / 100, 2),
                'tax_rate_bp' => $taxRateBp,
                'issue_date' => $issueDate,
                'due_date' => $dueDate,
                'notes' => trim(($notes ? $notes."\n" : '').'Wholesale consignment — charged to customer credit account.'),
                'terms' => 'Payment due within '.$termsDays.' days.',
            ]);

            foreach ($built['invoice_items'] as $row) {
                InvoiceItem::create(array_merge($row, ['invoice_id' => $invoice->id]));
            }

            foreach ($built['allocations'] as $alloc) {
                $this->assertAllocationWithinCap(
                    (int) $alloc['trade_delivery_line_id'],
                    (int) $alloc['qty_invoiced'],
                    $account,
                );
                TradeInvoiceAllocation::create(array_merge($alloc, ['invoice_id' => $invoice->id]));
            }

            foreach ($deliveries as $delivery) {
                if ($this->deliveryFullyAllocated($delivery->fresh(['lines']), $account)) {
                    $delivery->update([
                        'status' => TradeDelivery::STATUS_INVOICED,
                        'invoiced_at' => now(),
                    ]);
                }
            }

            $this->ledger->recordTradeInvoiceCharge(
                $customer->fresh(),
                $invoice,
                $actor,
                'trade:invoice:charge:'.$idempotencyKey,
            );

            // Invoice-basis / hybrid: post GST now. Payment-basis posts on payment.
            if ($this->gstPoster->shouldPostOnTaxInvoice()) {
                $entry = $this->gstPoster->postTaxInvoice($invoice->fresh(), $actor->id);
                $this->stampGstPeriod($invoice, $entry, $issueDate);
            } elseif ($this->gstPoster->shouldPostOrderOnPayment()) {
                // Payment basis — stamp intended period from issue date (actual post on pay).
                $this->stampGstPeriod($invoice, null, $issueDate);
            } else {
                abort(422, 'Cannot raise a wholesale invoice: GST accounting basis is not configured to post output tax.');
            }

            $this->audit->log(
                'trade.invoice.raised',
                'Invoice',
                $invoice->id,
                [],
                [
                    'trade_account_id' => $account->id,
                    'delivery_ids' => $deliveryIds,
                    'total_laar' => $totalInclusiveLaar,
                ],
            );

            return $invoice->fresh(['items', 'customer', 'tradeAccount']);
        });
    }

    /**
     * Firm-sale: invoice qty_sent immediately after dispatch (same tables).
     */
    public function raiseForFirmSaleDispatch(TradeDelivery $delivery, User $actor): Invoice
    {
        $delivery->loadMissing(['lines', 'tradeAccount.customer']);
        $account = $delivery->tradeAccount;
        if ($account === null || $account->settlement_mode !== TradeAccount::SETTLEMENT_FIRM_SALE) {
            abort(422, 'Firm-sale invoice requires a firm_sale trade account.');
        }

        foreach ($delivery->lines as $line) {
            $line->update([
                'qty_sold' => $line->qty_sent,
                'qty_returned_good' => 0,
                'qty_returned_waste' => 0,
                'qty_missing' => 0,
                'reported_sold_qty' => $line->qty_sent,
                'counted_return_qty' => 0,
            ]);
        }

        $delivery->update([
            'status' => TradeDelivery::STATUS_RECONCILED,
            'reconciled_at' => now(),
            'reconciled_by' => $actor->id,
            'reported_at' => now(),
            'reported_by' => $actor->id,
        ]);

        return $this->raise(
            $account,
            [$delivery->id],
            $actor,
            'trade:firm-sale:'.$delivery->id.':'.$delivery->idempotency_key,
            'Firm sale — invoiced at dispatch.',
        );
    }

    public function resolveMismatch(
        TradeDelivery $delivery,
        User $actor,
        string $decisionNotes,
    ): TradeDelivery {
        if (! $delivery->has_mismatch) {
            abort(422, 'This delivery is not flagged as a mismatch.');
        }
        if ($delivery->mismatch_resolved_at !== null) {
            return $delivery;
        }

        $notes = trim($decisionNotes);
        if ($notes === '') {
            throw ValidationException::withMessages([
                'decision' => ['Say what you decided — e.g. accept the shop count, or accept our count.'],
            ]);
        }

        return DB::transaction(function () use ($delivery, $actor, $notes) {
            $locked = TradeDelivery::lockForUpdate()->findOrFail($delivery->id);
            if ($locked->mismatch_resolved_at !== null) {
                return $locked;
            }

            $locked->update([
                'mismatch_resolved_at' => now(),
                'mismatch_resolved_by' => $actor->id,
                'mismatch_resolution_notes' => $notes,
            ]);

            $this->audit->log(
                'trade.delivery.mismatch_resolved',
                'TradeDelivery',
                $locked->id,
                ['has_mismatch' => true],
                ['resolved_by' => $actor->id, 'decision' => $notes],
            );

            return $locked->fresh(['lines.item', 'tradeAccount.customer']);
        });
    }

    public function waiveMissingCharge(
        TradeDelivery $delivery,
        User $actor,
        string $reason,
    ): TradeDelivery {
        $reason = trim($reason);
        if ($reason === '') {
            throw ValidationException::withMessages([
                'reason' => ['Type a reason for waiving the missing-quantity charge.'],
            ]);
        }

        return DB::transaction(function () use ($delivery, $actor, $reason) {
            $locked = TradeDelivery::lockForUpdate()->findOrFail($delivery->id);
            if ($locked->status === TradeDelivery::STATUS_INVOICED) {
                abort(422, 'This delivery is already invoiced.');
            }

            $locked->update([
                'missing_charge_waived' => true,
                'missing_waive_reason' => $reason,
                'missing_waived_by' => $actor->id,
            ]);

            $this->audit->log(
                'trade.delivery.missing_waived',
                'TradeDelivery',
                $locked->id,
                [],
                ['reason' => $reason, 'by' => $actor->id],
            );

            return $locked->fresh(['lines.item', 'tradeAccount.customer']);
        });
    }

    /**
     * Credit note for a trade invoice: reverse allocations + reverse ledger charge + GST.
     */
    public function createCreditNote(Invoice $parent, User $actor, string $reason): Invoice
    {
        if ($parent->trade_account_id === null) {
            abort(422, 'Not a wholesale trade invoice.');
        }
        if ($parent->type !== 'sale') {
            abort(422, 'Only a sale invoice can be credited.');
        }

        $reason = trim($reason);
        if ($reason === '') {
            throw ValidationException::withMessages([
                'credit_note_reason' => ['Say why this credit note is needed.'],
            ]);
        }

        return DB::transaction(function () use ($parent, $actor, $reason) {
            $parent = Invoice::lockForUpdate()->with('items')->findOrFail($parent->id);

            $cn = Invoice::create([
                'invoice_number' => $this->gstSequence->nextCreditNoteNumber(),
                'idempotency_key' => 'trade:cn:'.$parent->id.':'.uniqid(),
                'type' => 'credit_note',
                'status' => 'sent',
                'is_tax_invoice' => (bool) $parent->is_tax_invoice,
                'parent_invoice_id' => $parent->id,
                'customer_id' => $parent->customer_id,
                'trade_account_id' => $parent->trade_account_id,
                'customer_tin' => $parent->customer_tin,
                'created_by' => $actor->id,
                'recipient_name' => $parent->recipient_name,
                'recipient_phone' => $parent->recipient_phone,
                'recipient_address' => $parent->recipient_address,
                'subtotal' => $parent->subtotal,
                'subtotal_laar' => $parent->subtotal_laar,
                'tax_amount' => $parent->tax_amount,
                'tax_laar' => $parent->tax_laar,
                'discount_amount' => $parent->discount_amount,
                'discount_laar' => $parent->discount_laar,
                'total' => $parent->total,
                'total_laar' => $parent->total_laar,
                'tax_rate_bp' => $parent->tax_rate_bp,
                'issue_date' => now()->toDateString(),
                'notes' => "Credit note for {$parent->invoice_number}",
                'credit_note_reason' => $reason,
            ]);

            foreach ($parent->items as $item) {
                $cn->items()->create($item->only([
                    'item_id', 'inventory_item_id', 'description',
                    'quantity', 'unit', 'unit_price', 'unit_price_laar',
                    'total', 'total_laar', 'tax_rate_bp',
                ]));
            }

            $allocs = TradeInvoiceAllocation::where('invoice_id', $parent->id)->get();
            $deliveryIds = TradeDeliveryLine::whereIn('id', $allocs->pluck('trade_delivery_line_id'))
                ->pluck('trade_delivery_id')
                ->unique();

            TradeInvoiceAllocation::where('invoice_id', $parent->id)->delete();

            foreach ($deliveryIds as $deliveryId) {
                $delivery = TradeDelivery::lockForUpdate()->find($deliveryId);
                if ($delivery && $delivery->status === TradeDelivery::STATUS_INVOICED) {
                    $delivery->update([
                        'status' => TradeDelivery::STATUS_RECONCILED,
                        'invoiced_at' => null,
                    ]);
                }
            }

            $this->ledger->reverseTradeInvoiceCharge($parent, $cn, $actor);

            $entry = $this->gstPoster->postCreditNote($cn->fresh(), $actor->id);
            $this->stampGstPeriod($cn, $entry, $cn->issue_date?->toDateString() ?? now()->toDateString());

            $parent->update(['status' => 'void']);

            $this->audit->log(
                'trade.invoice.credit_note',
                'Invoice',
                $cn->id,
                [],
                ['parent_invoice_id' => $parent->id, 'reason' => $reason],
            );

            return $cn->fresh(['items', 'customer']);
        });
    }

    /**
     * Preview totals for ready-to-invoice UI (no writes).
     *
     * @param  list<int>  $deliveryIds
     * @return array{total_laar: int, sold_laar: int, missing_laar: int, blocked: list<array<string, mixed>>, lines: list<array<string, mixed>>}
     */
    public function preview(TradeAccount $account, array $deliveryIds): array
    {
        $deliveries = TradeDelivery::query()
            ->where('trade_account_id', $account->id)
            ->whereIn('id', $deliveryIds)
            ->with(['lines.item', 'tradeAccount'])
            ->get();

        $blocked = [];
        foreach ($deliveries as $delivery) {
            try {
                $this->assertInvoiceable($delivery, $account);
            } catch (\Throwable $e) {
                $blocked[] = [
                    'delivery_id' => $delivery->id,
                    'delivery_number' => $delivery->delivery_number,
                    'message' => $e->getMessage(),
                ];
            }
        }

        $ok = $deliveries->filter(fn (TradeDelivery $d) => collect($blocked)->where('delivery_id', $d->id)->isEmpty());
        $built = $ok->isEmpty()
            ? ['total_laar' => 0, 'sold_laar' => 0, 'missing_laar' => 0, 'invoice_items' => [], 'allocations' => []]
            : $this->buildLinesAndAllocations($ok, $account);

        return [
            'total_laar' => $built['total_laar'],
            'sold_laar' => $built['sold_laar'],
            'missing_laar' => $built['missing_laar'],
            'blocked' => $blocked,
            'lines' => $built['invoice_items'],
        ];
    }

    private function assertInvoiceable(TradeDelivery $delivery, TradeAccount $account): void
    {
        if ($delivery->status !== TradeDelivery::STATUS_RECONCILED
            && $delivery->status !== TradeDelivery::STATUS_INVOICED) {
            abort(422, sprintf(
                'Delivery %s is %s — only reconciled deliveries can be invoiced.',
                $delivery->delivery_number,
                $delivery->status,
            ));
        }

        if ($delivery->mismatchIsBlocking()) {
            $itemName = $delivery->lines->first()?->item?->name ?? 'an item';
            abort(422, sprintf(
                'Cannot invoice %s for %s: reported sold disagrees with the counted return on "%s". Resolve the mismatch first.',
                $delivery->delivery_number,
                $account->shop_name,
                $itemName,
            ));
        }

        if ($account->missing_policy === TradeAccount::MISSING_DISPUTE
            && ! $delivery->missing_charge_waived
            && $delivery->lines->sum('qty_missing') > 0) {
            abort(422, sprintf(
                'Delivery %s has missing quantity under dispute policy. Resolve or waive before invoicing.',
                $delivery->delivery_number,
            ));
        }
    }

    /**
     * @param  \Illuminate\Support\Collection<int, TradeDelivery>  $deliveries
     * @return array{total_laar: int, sold_laar: int, missing_laar: int, invoice_items: list<array<string, mixed>>, allocations: list<array<string, mixed>>}
     */
    private function buildLinesAndAllocations($deliveries, TradeAccount $account): array
    {
        /** @var array<string, array{item_id: ?int, description: string, quantity: int, unit_price_laar: int, total_laar: int, kind: string}> $agg */
        $agg = [];
        $allocations = [];
        $soldLaar = 0;
        $missingLaar = 0;

        foreach ($deliveries as $delivery) {
            foreach ($delivery->lines as $line) {
                $allocated = $this->exposure->allocatedQty($line->id);
                $soldUnalloc = max(0, (int) $line->qty_sold - $this->allocatedKindQty($line->id, TradeInvoiceAllocation::KIND_SOLD));
                $missingChargeable = 0;
                if ($account->missing_policy === TradeAccount::MISSING_CHARGE && ! $delivery->missing_charge_waived) {
                    $missingChargeable = max(0, (int) $line->qty_missing - $this->allocatedKindQty($line->id, TradeInvoiceAllocation::KIND_MISSING));
                }

                // Cap total allocated across kinds to sold + chargeable missing.
                $cap = $this->exposure->invoiceableQty($line, $account);
                $already = $allocated;
                if ($already >= $cap) {
                    continue;
                }

                $price = (int) $line->unit_price_laar;
                $name = $line->item?->name ?? 'Item';
                if ($line->variant) {
                    $name .= ' ('.$line->variant->name.')';
                }

                if ($soldUnalloc > 0) {
                    $qty = min($soldUnalloc, $cap - $already);
                    if ($qty > 0) {
                        $amount = $qty * $price;
                        $soldLaar += $amount;
                        $already += $qty;
                        $key = 'sold:'.$line->item_id.':'.$price;
                        if (! isset($agg[$key])) {
                            $agg[$key] = [
                                'item_id' => $line->item_id,
                                'description' => 'Sold: '.$name,
                                'quantity' => 0,
                                'unit_price_laar' => $price,
                                'total_laar' => 0,
                                'kind' => 'sold',
                                'tax_rate_bp' => $this->gstSettings->defaultTaxRateBp(),
                            ];
                        }
                        $agg[$key]['quantity'] += $qty;
                        $agg[$key]['total_laar'] += $amount;
                        $allocations[] = [
                            'trade_delivery_line_id' => $line->id,
                            'qty_invoiced' => $qty,
                            'amount_laar' => $amount,
                            'line_kind' => TradeInvoiceAllocation::KIND_SOLD,
                        ];
                    }
                }

                if ($missingChargeable > 0 && $already < $cap) {
                    $qty = min($missingChargeable, $cap - $already);
                    if ($qty > 0) {
                        $amount = $qty * $price;
                        $missingLaar += $amount;
                        $key = 'missing:'.$line->item_id.':'.$price;
                        if (! isset($agg[$key])) {
                            $agg[$key] = [
                                'item_id' => $line->item_id,
                                'description' => 'Not returned: '.$name,
                                'quantity' => 0,
                                'unit_price_laar' => $price,
                                'total_laar' => 0,
                                'kind' => 'missing',
                                'tax_rate_bp' => $this->gstSettings->defaultTaxRateBp(),
                            ];
                        }
                        $agg[$key]['quantity'] += $qty;
                        $agg[$key]['total_laar'] += $amount;
                        $allocations[] = [
                            'trade_delivery_line_id' => $line->id,
                            'qty_invoiced' => $qty,
                            'amount_laar' => $amount,
                            'line_kind' => TradeInvoiceAllocation::KIND_MISSING,
                        ];
                    }
                }
            }
        }

        $invoiceItems = [];
        foreach ($agg as $row) {
            $invoiceItems[] = [
                'item_id' => $row['item_id'],
                'description' => $row['description'],
                'quantity' => $row['quantity'],
                'unit' => 'ea',
                'unit_price_laar' => $row['unit_price_laar'],
                'unit_price' => round($row['unit_price_laar'] / 100, 2),
                'total_laar' => $row['total_laar'],
                'total' => round($row['total_laar'] / 100, 2),
                'tax_rate_bp' => $row['tax_rate_bp'],
            ];
        }

        return [
            'total_laar' => $soldLaar + $missingLaar,
            'sold_laar' => $soldLaar,
            'missing_laar' => $missingLaar,
            'invoice_items' => $invoiceItems,
            'allocations' => $allocations,
        ];
    }

    private function allocatedKindQty(int $lineId, string $kind): int
    {
        return (int) TradeInvoiceAllocation::query()
            ->where('trade_delivery_line_id', $lineId)
            ->where('line_kind', $kind)
            ->sum('qty_invoiced');
    }

    private function assertAllocationWithinCap(int $lineId, int $addingQty, TradeAccount $account): void
    {
        $line = TradeDeliveryLine::with('delivery')->findOrFail($lineId);
        $cap = $this->exposure->invoiceableQty($line, $account);
        $current = $this->exposure->allocatedQty($lineId);
        if ($current + $addingQty > $cap) {
            abort(422, sprintf(
                'Cannot invoice %d more of "%s" — only %d left of sold + charged missing (already invoiced %d).',
                $addingQty,
                $line->item?->name ?? 'item',
                max(0, $cap - $current),
                $current,
            ));
        }
    }

    private function deliveryFullyAllocated(TradeDelivery $delivery, TradeAccount $account): bool
    {
        foreach ($delivery->lines as $line) {
            $cap = $this->exposure->invoiceableQty($line, $account);
            if ($cap <= 0) {
                continue;
            }
            if ($this->exposure->allocatedQty($line->id) < $cap) {
                return false;
            }
        }

        return true;
    }

    private function stampGstPeriod(Invoice $invoice, ?TaxLedgerEntry $entry, string $issueDate): void
    {
        $periodKey = $entry?->period_key;
        if ($periodKey === null) {
            $periodKey = app(\App\Domains\Gst\Services\GstPeriodService::class)->periodKeyForDate(Carbon::parse($issueDate));
        }

        $ledgerDate = strlen($periodKey) >= 7
            ? $periodKey.'-01'
            : $issueDate;

        // If redirected, period_key month differs from issue month — keep both.
        $invoice->update([
            'gst_period_key' => $periodKey,
            'gst_ledger_date' => $entry?->document_date ?? $ledgerDate,
        ]);
    }
}
