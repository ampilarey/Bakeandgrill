<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Domains\Shared\ValueObjects\Money;
use App\Models\Item;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\User;
use App\Models\Variant;
use App\Services\AuditLogService;
use App\Services\StockManagementService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class TradeDispatchService
{
    public function __construct(
        private readonly TradePriceResolver $prices,
        private readonly TradeCreditExposureService $exposure,
        private readonly StockManagementService $stock,
        private readonly TradeSmsNotifier $sms,
        private readonly AuditLogService $audit,
        private readonly \App\Domains\Inventory\Services\InventoryDeductionService $ingredients,
    ) {}

    /**
     * Create and dispatch a delivery in one transaction (idempotent).
     *
     * @param list<array{item_id: int, variant_id?: int|null, qty: int}> $lines
     */
    public function dispatch(
        TradeAccount $account,
        array $lines,
        User $actor,
        string $idempotencyKey,
        ?string $driverName = null,
        ?string $notes = null,
        ?string $expectedReturnAt = null,
        ?string $creditOverrideReason = null,
    ): TradeDelivery {
        $existing = TradeDelivery::where('idempotency_key', $idempotencyKey)->first();
        if ($existing) {
            return $existing->load(['lines.item', 'lines.variant', 'tradeAccount.customer']);
        }

        if ($lines === []) {
            throw ValidationException::withMessages(['lines' => ['Add at least one item.']]);
        }

        $account->loadMissing('customer');
        $customer = $account->customer;
        if ($customer === null) {
            abort(422, 'Trade account has no customer.');
        }

        $resolvedLines = [];
        $deliveryValueLaar = 0;

        foreach ($lines as $index => $raw) {
            $item = Item::query()->find($raw['item_id'] ?? null);
            if (!$item) {
                throw ValidationException::withMessages([
                    "lines.{$index}.item_id" => ['Item not found.'],
                ]);
            }

            $qty = (int) ($raw['qty'] ?? 0);
            if ($qty < 1) {
                throw ValidationException::withMessages([
                    "lines.{$index}.qty" => ['Quantity must be at least 1.'],
                ]);
            }

            $variant = null;
            if (!empty($raw['variant_id'])) {
                $variant = Variant::where('item_id', $item->id)->find($raw['variant_id']);
                if (!$variant) {
                    throw ValidationException::withMessages([
                        "lines.{$index}.variant_id" => ['Variant not found for this item.'],
                    ]);
                }
            }

            $price = $this->prices->resolve($account, $item, $variant);
            if (!$price->found) {
                abort(422, sprintf(
                    'No wholesale price for "%s"%s. Set a shop price, a standard wholesale price, or a default discount before dispatching.',
                    $item->name,
                    $variant ? ' (' . $variant->name . ')' : '',
                ));
            }

            $costSource = $variant?->cost ?? $item->cost;
            $unitCostLaar = $costSource !== null
                ? Money::fromMvr($costSource)->amountLaar
                : 0;

            $lineValue = $price->priceLaar * $qty;
            $deliveryValueLaar += $lineValue;

            $resolvedLines[] = [
                'item' => $item,
                'variant' => $variant,
                'qty' => $qty,
                'unit_price_laar' => $price->priceLaar,
                'unit_cost_laar' => $unitCostLaar,
            ];
        }

        $ownerOverride = $creditOverrideReason !== null && trim($creditOverrideReason) !== '';
        $perms = app(\App\Services\PermissionService::class);
        if ($ownerOverride && !$perms->isOwner($actor)) {
            abort(403, 'Only the owner can override the credit limit.');
        }

        $delivery = DB::transaction(function () use (
            $account,
            $customer,
            $resolvedLines,
            $actor,
            $idempotencyKey,
            $driverName,
            $notes,
            $expectedReturnAt,
            $creditOverrideReason,
            $ownerOverride,
            $deliveryValueLaar,
        ) {
            // Re-check idempotency inside the transaction.
            $existing = TradeDelivery::where('idempotency_key', $idempotencyKey)->lockForUpdate()->first();
            if ($existing) {
                return $existing;
            }

            // Credit exposure gate WITH the customer row locked — prevents two
            // simultaneous dispatches both passing the limit (TOCTOU).
            $lockedCustomer = \App\Models\Customer::lockForUpdate()->findOrFail($customer->id);
            $this->exposure->assertCanDispatch($lockedCustomer, $deliveryValueLaar, $ownerOverride);

            $delivery = TradeDelivery::create([
                'trade_account_id' => $account->id,
                'delivery_number' => $this->nextDeliveryNumber(),
                'status' => TradeDelivery::STATUS_DISPATCHED,
                'dispatched_at' => now(),
                'dispatched_by' => $actor->id,
                'driver_name' => $driverName,
                'expected_return_at' => $expectedReturnAt,
                'notes' => $notes,
                'idempotency_key' => $idempotencyKey,
                'credit_override_reason' => $ownerOverride ? trim((string) $creditOverrideReason) : null,
                'credit_override_by' => $ownerOverride ? $actor->id : null,
            ]);

            foreach ($resolvedLines as $i => $row) {
                /** @var Item $item */
                $item = $row['item'];
                /** @var Variant|null $variant */
                $variant = $row['variant'];
                $qty = $row['qty'];

                TradeDeliveryLine::create([
                    'trade_delivery_id' => $delivery->id,
                    'item_id' => $item->id,
                    'variant_id' => $variant?->id,
                    'qty_sent' => $qty,
                    'unit_price_laar' => $row['unit_price_laar'],
                    'unit_cost_laar' => $row['unit_cost_laar'],
                ]);

                $stockKey = 'trade:dispatch:' . $delivery->id . ':line:' . $i;
                try {
                    if ($variant) {
                        $this->stock->deductConsignmentVariantStock(
                            $variant,
                            $qty,
                            $stockKey,
                            $delivery->id,
                            $actor->id,
                            $row['unit_cost_laar'],
                        );
                    } else {
                        $this->stock->deductConsignmentStock(
                            $item,
                            $qty,
                            $stockKey,
                            $delivery->id,
                            $actor->id,
                            $row['unit_cost_laar'],
                        );
                    }

                    // A bundle leaves as its contents (2026-09-07 audit,
                    // finding 14) — each required child's own count goes too.
                    foreach ($this->bundleChildren($item, $qty) as $child) {
                        $childKey = $stockKey . ':child:' . $child['item']->id . ($child['variant'] ? ':v' . $child['variant']->id : '');
                        if ($child['variant']) {
                            $this->stock->deductConsignmentVariantStock($child['variant'], $child['quantity'], $childKey, $delivery->id, $actor->id, null);
                        } else {
                            $this->stock->deductConsignmentStock($child['item'], $child['quantity'], $childKey, $delivery->id, $actor->id, null);
                        }
                    }
                } catch (\RuntimeException $e) {
                    abort(422, $e->getMessage());
                }

                // Ingredients (finding 2): the dish on the van was made from
                // something, and nothing else ever took it off the shelf.
                $this->ingredients->consume(
                    $item,
                    $variant,
                    $qty * ($variant?->consumptionFactor() ?? 1.0),
                    'trade:dispatch:' . $delivery->id . ':line:' . $i,
                    'trade_delivery',
                    (int) $delivery->id,
                    $actor->id,
                    'Trade delivery ' . $delivery->delivery_number,
                );
                foreach ($this->bundleChildren($item, $qty) as $child) {
                    $this->ingredients->consume(
                        $child['item'],
                        $child['variant'],
                        $child['quantity'] * ($child['variant']?->consumptionFactor() ?? 1.0),
                        'trade:dispatch:' . $delivery->id . ':line:' . $i . ':child:' . $child['item']->id . ($child['variant'] ? ':v' . $child['variant']->id : ''),
                        'trade_delivery',
                        (int) $delivery->id,
                        $actor->id,
                        'Trade delivery ' . $delivery->delivery_number,
                    );
                }
            }

            $this->audit->log(
                'trade.delivery.dispatched',
                'TradeDelivery',
                $delivery->id,
                [],
                [
                    'delivery_number' => $delivery->delivery_number,
                    'value_laar' => $deliveryValueLaar,
                    'lines' => count($resolvedLines),
                ],
                array_filter([
                    'credit_override' => $ownerOverride ?: null,
                    'reason' => $ownerOverride ? trim((string) $creditOverrideReason) : null,
                ]),
            );

            // Firm-sale: invoice qty_sent in the same transaction so a failure rolls stock back.
            if ($account->settlement_mode === TradeAccount::SETTLEMENT_FIRM_SALE) {
                app(TradeInvoiceService::class)->raiseForFirmSaleDispatch(
                    $delivery->fresh(['lines', 'tradeAccount.customer']),
                    $actor,
                );
            }

            return $delivery;
        });

        $delivery->load(['lines.item', 'lines.variant', 'tradeAccount.customer']);

        try {
            $this->sms->sendDispatchToShop($delivery);
        } catch (\Throwable $e) {
            report($e);
        }

        return $delivery;
    }

    public function cancel(TradeDelivery $delivery, User $actor): TradeDelivery
    {
        if ($delivery->status !== TradeDelivery::STATUS_DISPATCHED) {
            abort(422, 'Only a dispatched delivery can be cancelled.');
        }

        return DB::transaction(function () use ($delivery, $actor) {
            $locked = TradeDelivery::lockForUpdate()->with('lines.item', 'lines.variant')->findOrFail($delivery->id);
            if ($locked->status !== TradeDelivery::STATUS_DISPATCHED) {
                abort(422, 'Only a dispatched delivery can be cancelled.');
            }

            foreach ($locked->lines as $i => $line) {
                $key = 'trade:cancel:' . $locked->id . ':line:' . $line->id;
                if ($line->variant_id && $line->variant) {
                    $this->stock->restoreConsignmentVariantStock(
                        $line->variant,
                        $line->qty_sent,
                        $key,
                        $locked->id,
                        $actor->id,
                        $line->unit_cost_laar,
                    );
                } else {
                    $this->stock->restoreConsignmentStock(
                        $line->item,
                        $line->qty_sent,
                        $key,
                        $locked->id,
                        $actor->id,
                        $line->unit_cost_laar,
                    );
                }

                $this->returnToShelf($locked, $line, $i, (int) $line->qty_sent, 'trade:cancel:' . $locked->id . ':line:' . $line->id, $actor->id, 'cancelled');
            }

            $locked->update([
                'status' => TradeDelivery::STATUS_CANCELLED,
                'notes' => trim(($locked->notes ? $locked->notes . "\n" : '') . 'Cancelled by ' . $actor->name),
            ]);

            $this->audit->log(
                'trade.delivery.cancelled',
                'TradeDelivery',
                $locked->id,
                ['status' => TradeDelivery::STATUS_DISPATCHED],
                ['status' => TradeDelivery::STATUS_CANCELLED],
            );

            return $locked->fresh(['lines.item', 'lines.variant', 'tradeAccount.customer']);
        });
    }

    /**
     * Dispatched deliveries are immutable — refuse any line/field edit.
     */
    public function assertMutable(TradeDelivery $delivery): void
    {
        if ($delivery->isImmutable()) {
            abort(422, 'This delivery has been dispatched and cannot be edited. Cancel it or adjust at reconciliation.');
        }
    }

    private function nextDeliveryNumber(): string
    {
        $prefix = 'TD-' . now()->format('Ymd') . '-';
        $last = TradeDelivery::query()
            ->where('delivery_number', 'like', $prefix . '%')
            ->orderByDesc('delivery_number')
            ->value('delivery_number');

        $seq = 1;
        if (is_string($last) && preg_match('/-(\d+)$/', $last, $m)) {
            $seq = ((int) $m[1]) + 1;
        }

        return $prefix . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
    }

    /**
     * A bundle's required children, for a wholesale line.
     *
     * @return list<array{item: Item, variant: ?Variant, quantity: int}>
     */
    private function bundleChildren(Item $item, int $qty): array
    {
        if (!$item->is_combo) {
            return [];
        }

        return app(\App\Domains\Menu\Services\ComboChildStockService::class)
            ->requiredChildrenForStock($item, $qty);
    }

    /**
     * Put back what dispatch took for `$qty` of a line — the bundle's
     * children and every ingredient — under keys that pair with dispatch's,
     * so a second call is a no-op and nothing never taken comes back.
     */
    public function returnToShelf(
        TradeDelivery $delivery,
        TradeDeliveryLine $line,
        int $lineIndex,
        int $qty,
        string $restorePrefix,
        int $actorId,
        string $why,
    ): void {
        if ($qty <= 0 || !$line->item) {
            return;
        }
        $item = $line->item;
        $variant = $line->variant_id ? $line->variant : null;
        $dispatchPrefix = 'trade:dispatch:' . $delivery->id . ':line:' . $lineIndex;
        $notes = 'Trade delivery ' . $delivery->delivery_number . ' ' . $why;

        foreach ($this->bundleChildren($item, $qty) as $child) {
            $suffix = ':child:' . $child['item']->id . ($child['variant'] ? ':v' . $child['variant']->id : '');
            if ($child['variant']) {
                $this->stock->restoreConsignmentVariantStock($child['variant'], $child['quantity'], $restorePrefix . $suffix, $delivery->id, $actorId, null);
            } else {
                $this->stock->restoreConsignmentStock($child['item'], $child['quantity'], $restorePrefix . $suffix, $delivery->id, $actorId, null);
            }
            $this->ingredients->restore(
                $child['item'],
                $child['variant'],
                $child['quantity'] * ($child['variant']?->consumptionFactor() ?? 1.0),
                $dispatchPrefix . $suffix,
                $restorePrefix . $suffix,
                '',
                'trade_delivery',
                (int) $delivery->id,
                $actorId,
                $notes,
                movementType: 'consignment_in',
            );
        }

        $this->ingredients->restore(
            $item,
            $variant,
            $qty * ($variant?->consumptionFactor() ?? 1.0),
            $dispatchPrefix,
            $restorePrefix,
            '',
            'trade_delivery',
            (int) $delivery->id,
            $actorId,
            $notes,
            movementType: 'consignment_in',
        );
    }
}
