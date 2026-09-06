<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\User;
use App\Models\WasteLog;
use App\Services\AuditLogService;
use App\Services\StockManagementService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Reconciliation records quantities only — no invoices, ledger, or GST.
 */
final class TradeReconciliationService
{
    public function __construct(
        private readonly StockManagementService $stock,
        private readonly TradeSmsNotifier $sms,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param  list<array{
     *   line_id: int,
     *   reported_sold_qty: int,
     *   counted_return_qty: int,
     *   qty_missing?: int,
     *   return_condition?: string|null,
     *   return_action?: string|null,
     *   return_idempotency_key: string
     * }>  $linePayloads
     */
    public function reconcile(
        TradeDelivery $delivery,
        array $linePayloads,
        User $actor,
    ): TradeDelivery {
        if ($delivery->status !== TradeDelivery::STATUS_DISPATCHED) {
            abort(422, 'Only a dispatched delivery can be reconciled.');
        }

        $delivery->loadMissing(['lines.item', 'lines.variant', 'tradeAccount']);

        return DB::transaction(function () use ($delivery, $linePayloads, $actor) {
            $locked = TradeDelivery::lockForUpdate()->with(['lines.item', 'lines.variant', 'tradeAccount'])->findOrFail($delivery->id);
            if ($locked->status !== TradeDelivery::STATUS_DISPATCHED) {
                abort(422, 'Only a dispatched delivery can be reconciled.');
            }

            $byId = collect($linePayloads)->keyBy('line_id');
            $hasMismatch = false;
            $mismatchLines = [];

            foreach ($locked->lines as $line) {
                $payload = $byId->get($line->id);
                if ($payload === null) {
                    throw ValidationException::withMessages([
                        'lines' => ["Missing reconciliation data for line {$line->id} ({$line->item?->name})."],
                    ]);
                }

                $reportedSold = (int) $payload['reported_sold_qty'];
                $countedReturn = (int) $payload['counted_return_qty'];
                $qtyMissing = (int) ($payload['qty_missing'] ?? max(0, $line->qty_sent - $reportedSold - $countedReturn));

                if ($countedReturn < 0 || $reportedSold < 0 || $qtyMissing < 0) {
                    throw ValidationException::withMessages([
                        "lines.{$line->id}" => ['Quantities cannot be negative.'],
                    ]);
                }

                // Physical split: sold (physical) + returned + missing = sent
                $qtySold = $line->qty_sent - $countedReturn - $qtyMissing;
                if ($qtySold < 0) {
                    throw ValidationException::withMessages([
                        "lines.{$line->id}" => [sprintf(
                            '"%s": counted return (%d) plus missing (%d) exceeds quantity sent (%d).',
                            $line->item?->name ?? 'Item',
                            $countedReturn,
                            $qtyMissing,
                            $line->qty_sent,
                        )],
                    ]);
                }

                $returnAction = $payload['return_action'] ?? null;
                $qtyReturnedGood = 0;
                $qtyReturnedWaste = 0;

                if ($countedReturn > 0) {
                    if (!in_array($returnAction, [
                        TradeDeliveryLine::ACTION_ACCEPT_TO_STOCK,
                        TradeDeliveryLine::ACTION_REJECT_TO_WASTE,
                    ], true)) {
                        throw ValidationException::withMessages([
                            "lines.{$line->id}.return_action" => [
                                'Choose whether returned goods go back to stock or are thrown away.',
                            ],
                        ]);
                    }
                    if ($returnAction === TradeDeliveryLine::ACTION_ACCEPT_TO_STOCK) {
                        $qtyReturnedGood = $countedReturn;
                    } else {
                        $qtyReturnedWaste = $countedReturn;
                    }
                }

                // Balance: qty_sent = sold + returned_good + returned_waste + missing
                if ($qtySold + $qtyReturnedGood + $qtyReturnedWaste + $qtyMissing !== $line->qty_sent) {
                    throw ValidationException::withMessages([
                        "lines.{$line->id}" => [sprintf(
                            '"%s" does not balance: sent %d ≠ sold %d + returned good %d + waste %d + missing %d.',
                            $line->item?->name ?? 'Item',
                            $line->qty_sent,
                            $qtySold,
                            $qtyReturnedGood,
                            $qtyReturnedWaste,
                            $qtyMissing,
                        )],
                    ]);
                }

                $impliedSold = $line->qty_sent - $countedReturn;
                if ($reportedSold !== $impliedSold) {
                    $hasMismatch = true;
                    $mismatchLines[] = [$line, $reportedSold, $impliedSold];
                }

                $idem = (string) $payload['return_idempotency_key'];
                if (TradeDeliveryLine::where('return_idempotency_key', $idem)->where('id', '!=', $line->id)->exists()) {
                    abort(422, 'Duplicate return idempotency key.');
                }

                // Marking sold must NOT deduct stock again — goods left at dispatch.
                $line->update([
                    'reported_sold_qty' => $reportedSold,
                    'counted_return_qty' => $countedReturn,
                    'qty_sold' => $qtySold,
                    'qty_returned_good' => $qtyReturnedGood,
                    'qty_returned_waste' => $qtyReturnedWaste,
                    'qty_missing' => $qtyMissing,
                    'return_condition' => $payload['return_condition'] ?? null,
                    'return_action' => $returnAction,
                    'return_idempotency_key' => $idem,
                ]);

                if ($qtyReturnedGood > 0) {
                    $inKey = 'trade:return:accept:' . $locked->id . ':line:' . $line->id;
                    if ($line->variant_id && $line->variant) {
                        $this->stock->restoreConsignmentVariantStock(
                            $line->variant,
                            $qtyReturnedGood,
                            $inKey,
                            $locked->id,
                            $actor->id,
                            $line->unit_cost_laar,
                        );
                    } else {
                        $this->stock->restoreConsignmentStock(
                            $line->item,
                            $qtyReturnedGood,
                            $inKey,
                            $locked->id,
                            $actor->id,
                            $line->unit_cost_laar,
                        );
                    }

                    // A good return brings its bundle children and its
                    // ingredients back too (2026-09-07 audit).
                    $lineIndex = (int) $locked->lines->sortBy('id')->values()->search(fn ($l) => (int) $l->id === (int) $line->id);
                    app(TradeDispatchService::class)->returnToShelf(
                        $locked,
                        $line,
                        $lineIndex,
                        (int) $qtyReturnedGood,
                        $inKey,
                        $actor->id,
                        'returned',
                    );
                }

                if ($qtyReturnedWaste > 0) {
                    WasteLog::create([
                        'item_id' => $line->item_id,
                        'user_id' => $actor->id,
                        'quantity' => $qtyReturnedWaste,
                        'unit' => 'ea',
                        'cost_estimate' => round(($line->unit_cost_laar * $qtyReturnedWaste) / 100, 2),
                        'reason' => 'quality',
                        'notes' => 'Trade return rejected — delivery ' . $locked->delivery_number,
                    ]);
                    // Rejected returns do NOT return to stock.
                }
            }

            $selfReconciled = $locked->dispatched_by !== null
                && (int) $locked->dispatched_by === (int) $actor->id;

            $locked->update([
                'status' => TradeDelivery::STATUS_RECONCILED,
                'reconciled_at' => now(),
                'reconciled_by' => $actor->id,
                'reported_by' => $actor->id,
                'reported_at' => now(),
                'has_mismatch' => $hasMismatch,
                'self_reconciled' => $selfReconciled,
            ]);

            $this->audit->log(
                'trade.delivery.reconciled',
                'TradeDelivery',
                $locked->id,
                ['status' => TradeDelivery::STATUS_DISPATCHED],
                [
                    'status' => TradeDelivery::STATUS_RECONCILED,
                    'has_mismatch' => $hasMismatch,
                    'self_reconciled' => $selfReconciled,
                ],
                array_filter([
                    'self_reconciled' => $selfReconciled ?: null,
                    'reason' => $selfReconciled
                        ? 'Reconciled by the same staff member who dispatched'
                        : null,
                ]),
            );

            if ($hasMismatch) {
                foreach ($mismatchLines as [$mLine, $reported, $implied]) {
                    try {
                        $this->sms->sendMismatchToOwner($locked, $mLine, $reported, $implied);
                    } catch (\Throwable $e) {
                        report($e);
                    }
                }
            }

            return $locked->fresh(['lines.item', 'lines.variant', 'tradeAccount.customer']);
        });
    }
}
