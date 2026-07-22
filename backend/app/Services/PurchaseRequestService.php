<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\PurchaseRequestItemQuote;
use App\Models\SiteSetting;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class PurchaseRequestService
{
    public function __construct(private readonly AuditLogService $audit) {}

    /**
     * @param array<string, mixed> $data
     * @param list<array<string, mixed>> $items
     */
    public function create(User $user, array $data, array $items, Request $request): PurchaseRequest
    {
        return DB::transaction(function () use ($user, $data, $items, $request) {
            $pr = PurchaseRequest::create([
                'request_no' => PurchaseRequestNumberGenerator::next(),
                'title' => $data['title'] ?? null,
                'source' => $data['source'] ?? 'admin',
                'status' => 'requested',
                'priority' => $data['priority'] ?? 'normal',
                'needed_by' => $data['needed_by'] ?? null,
                'requested_by' => $user->id,
                'notes' => $data['notes'] ?? null,
            ]);

            foreach ($items as $line) {
                $this->addItem($pr, $line);
            }

            $this->recomputeTotals($pr);
            $pr = $pr->fresh(['items', 'requester', 'assignee']);

            $this->auditPurchaseRequest('purchase_request.created', $pr, [], ['status' => 'requested'], $request, $user);

            $threshold = (int) SiteSetting::get('purchase_requests_auto_approve_under_laar', '0');
            if ($threshold > 0
                && $pr->total_estimated_laar !== null
                && (int) $pr->total_estimated_laar > 0
                && (int) $pr->total_estimated_laar <= $threshold
            ) {
                $pr = $this->approveInternal($pr, $user, $request, auto: true);
            }

            return $pr->fresh(['items', 'requester', 'assignee']);
        });
    }

    /** @param array<string, mixed> $line */
    public function addItem(PurchaseRequest $pr, array $line): PurchaseRequestItem
    {
        if ($pr->isTerminal()) {
            throw ValidationException::withMessages(['request' => ['Request is closed.']]);
        }

        return PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'inventory_item_id' => $line['inventory_item_id'] ?? null,
            'menu_item_id' => $line['menu_item_id'] ?? null,
            'free_text_name' => $line['free_text_name'] ?? null,
            'category' => $line['category'] ?? null,
            'requested_qty' => $line['requested_qty'],
            'requested_unit' => $line['requested_unit'],
            'estimated_unit_cost_laar' => $line['estimated_unit_cost_laar'] ?? null,
            'reason' => $line['reason'] ?? null,
            'notes' => $line['notes'] ?? null,
            'status' => 'pending',
        ]);
    }

    /** @param array<string, mixed> $data */
    public function update(PurchaseRequest $pr, array $data, User $user, Request $request): PurchaseRequest
    {
        if ($pr->isTerminal()) {
            throw ValidationException::withMessages(['request' => ['Request is closed.']]);
        }

        $old = $pr->only(['title', 'priority', 'needed_by', 'notes']);
        $pr->update(array_filter([
            'title' => $data['title'] ?? $pr->title,
            'priority' => $data['priority'] ?? $pr->priority,
            'needed_by' => array_key_exists('needed_by', $data) ? $data['needed_by'] : $pr->needed_by,
            'notes' => $data['notes'] ?? $pr->notes,
        ], fn ($v) => $v !== null));

        if (!empty($data['items']) && is_array($data['items'])) {
            foreach ($data['items'] as $line) {
                if (!empty($line['id'])) {
                    $item = PurchaseRequestItem::where('purchase_request_id', $pr->id)
                        ->where('id', $line['id'])
                        ->firstOrFail();
                    $item->update(array_filter([
                        'approved_qty' => $line['approved_qty'] ?? $item->approved_qty,
                        'requested_qty' => $line['requested_qty'] ?? $item->requested_qty,
                        'notes' => $line['notes'] ?? $item->notes,
                    ], fn ($v) => $v !== null));
                }
            }
        }

        $this->recomputeTotals($pr->fresh());
        $this->auditPurchaseRequest('purchase_request.updated', $pr->fresh(), $old, $pr->fresh()->only(array_keys($old)), $request, $user);

        return $pr->fresh(['items', 'requester', 'assignee']);
    }

    public function approve(PurchaseRequest $pr, User $user, Request $request): PurchaseRequest
    {
        if ($pr->status !== 'requested') {
            throw ValidationException::withMessages(['status' => ['Only requested items can be approved.']]);
        }

        if ($pr->requested_by === $user->id) {
            $roleSlug = $user->role?->slug;
            if (!in_array($roleSlug, ['owner', 'manager'], true)) {
                throw ValidationException::withMessages(['approve' => ['You cannot approve your own request.']]);
            }
        }

        return $this->approveInternal($pr, $user, $request, auto: false);
    }

    private function approveInternal(PurchaseRequest $pr, User $user, Request $request, bool $auto): PurchaseRequest
    {
        return DB::transaction(function () use ($pr, $user, $request, $auto) {
            $oldStatus = $pr->status;
            $pr->update([
                'status' => 'approved',
                'approved_by' => $user->id,
            ]);

            $pr->items()->where('status', 'pending')->update(['status' => 'approved']);

            foreach ($pr->items as $item) {
                if ($item->approved_qty === null) {
                    $item->update(['approved_qty' => $item->requested_qty]);
                }
            }

            $this->recomputeTotals($pr->fresh());
            $this->auditPurchaseRequest(
                $auto ? 'purchase_request.auto_approved' : 'purchase_request.approved',
                $pr->fresh(),
                ['status' => $oldStatus],
                ['status' => 'approved'],
                $request,
                $user,
                $auto ? ['reason' => 'under_threshold'] : [],
            );

            return $pr->fresh(['items', 'requester', 'assignee', 'approver']);
        });
    }

    public function reject(PurchaseRequest $pr, User $user, ?string $reason, Request $request): PurchaseRequest
    {
        if (!in_array($pr->status, ['requested', 'approved'], true)) {
            throw ValidationException::withMessages(['status' => ['Request cannot be rejected in current status.']]);
        }

        return DB::transaction(function () use ($pr, $user, $reason, $request) {
            $oldStatus = $pr->status;
            $pr->update([
                'status' => 'rejected',
                'rejected_by' => $user->id,
                'rejection_reason' => $reason,
            ]);
            $pr->items()->update(['status' => 'cancelled']);

            $this->auditPurchaseRequest('purchase_request.rejected', $pr->fresh(), ['status' => $oldStatus], ['status' => 'rejected'], $request, $user, ['reason' => $reason]);

            return $pr->fresh(['items', 'requester']);
        });
    }

    public function assign(PurchaseRequest $pr, User $assignee, User $actor, Request $request): PurchaseRequest
    {
        if (!in_array($pr->status, ['approved', 'assigned', 'buying', 'partially_bought'], true)) {
            throw ValidationException::withMessages(['status' => ['Request must be approved before assignment.']]);
        }

        return DB::transaction(function () use ($pr, $assignee, $actor, $request) {
            $pr->update([
                'assigned_to' => $assignee->id,
                'status' => 'assigned',
            ]);
            $pr->items()->whereIn('status', ['approved', 'pending'])->update(['status' => 'assigned']);

            $this->auditPurchaseRequest('purchase_request.assigned', $pr->fresh(), [], ['assigned_to' => $assignee->id], $request, $actor);

            return $pr->fresh(['items', 'requester', 'assignee']);
        });
    }

    public function cancel(PurchaseRequest $pr, User $user, Request $request): PurchaseRequest
    {
        if (in_array($pr->status, PurchaseRequest::TERMINAL_STATUSES, true)) {
            throw ValidationException::withMessages(['status' => ['Request is already closed.']]);
        }

        return DB::transaction(function () use ($pr, $user, $request) {
            $oldStatus = $pr->status;
            $pr->update(['status' => 'cancelled']);
            $pr->items()->whereNotIn('status', PurchaseRequestItem::TERMINAL_STATUSES)->update(['status' => 'cancelled']);

            $this->auditPurchaseRequest('purchase_request.cancelled', $pr->fresh(), ['status' => $oldStatus], ['status' => 'cancelled'], $request, $user);

            return $pr->fresh(['items']);
        });
    }

    /** @param array<string, mixed> $data */
    public function markBought(PurchaseRequestItem $item, User $user, array $data, Request $request): PurchaseRequestItem
    {
        $this->assertCanBuy($item, $user);

        return DB::transaction(function () use ($item, $user, $data, $request) {
            $quote = null;
            if (!empty($data['from_quote_id'])) {
                $quote = PurchaseRequestItemQuote::query()
                    ->where('purchase_request_item_id', $item->id)
                    ->where('id', (int) $data['from_quote_id'])
                    ->first();
                if (!$quote) {
                    throw ValidationException::withMessages(['from_quote_id' => ['Quote not found for this line.']]);
                }
                $data['actual_unit_cost_laar'] = $quote->unit_price_laar;
                $data['actual_unit'] = $data['actual_unit'] ?? $quote->unit ?? $item->requested_unit;
                if ($quote->supplier_id) {
                    $data['supplier_id'] = $quote->supplier_id;
                }
                if ($quote->supplier_name_text) {
                    $data['supplier_name_text'] = $quote->supplier_name_text;
                } elseif ($quote->supplier_id) {
                    $data['supplier_name_text'] = $data['supplier_name_text']
                        ?? Supplier::find($quote->supplier_id)?->name;
                }
            }

            $qty = (float) ($data['actual_qty'] ?? $item->approved_qty ?? $item->requested_qty);
            $unitCostLaar = isset($data['actual_unit_cost_laar']) ? (int) $data['actual_unit_cost_laar'] : null;
            $totalLaar = $unitCostLaar !== null ? (int) round($qty * $unitCostLaar) : null;

            $item->update([
                'status' => 'bought',
                'actual_qty' => $qty,
                'actual_unit' => $data['actual_unit'] ?? $item->requested_unit,
                'actual_unit_cost_laar' => $unitCostLaar,
                'actual_total_laar' => $totalLaar,
                'supplier_id' => $data['supplier_id'] ?? $item->supplier_id,
                'supplier_name_text' => $data['supplier_name_text'] ?? $item->supplier_name_text,
                'buyer_notes' => $data['buyer_notes'] ?? $item->buyer_notes,
                'bought_at' => now(),
            ]);

            if ($quote) {
                PurchaseRequestItemQuote::query()
                    ->where('purchase_request_item_id', $item->id)
                    ->whereNotNull('selected_at')
                    ->update(['selected_at' => null, 'savings_laar' => null]);

                $quote->update([
                    'selected_at' => now(),
                    'savings_laar' => $this->quoteSavingsLaar($item->fresh(), $quote, $qty, $unitCostLaar),
                ]);
            }

            $pr = $item->purchaseRequest;
            $this->recomputeTotals($pr);
            $this->recomputeRequestStatus($pr);
            $this->auditItem('purchase_request.bought', $item->fresh(), ['status' => 'assigned'], ['status' => 'bought'], $request, $user);

            return $item->fresh(['purchaseRequest', 'inventoryItem', 'quotes']);
        });
    }

    /**
     * @param array<string, mixed> $data
     */
    public function addQuote(PurchaseRequestItem $item, User $user, array $data, Request $request): PurchaseRequestItemQuote
    {
        $this->assertCanBuy($item, $user);

        if (in_array($item->status, PurchaseRequestItem::TERMINAL_STATUSES, true)
            || in_array($item->status, ['bought', 'partially_bought', 'received'], true)
        ) {
            throw ValidationException::withMessages(['item' => ['Cannot add quotes after the line is bought or closed.']]);
        }

        if (empty($data['supplier_id']) && empty($data['supplier_name_text'])) {
            throw ValidationException::withMessages(['supplier_name_text' => ['Provide a supplier or shop name.']]);
        }

        $quote = PurchaseRequestItemQuote::create([
            'purchase_request_item_id' => $item->id,
            'supplier_id' => $data['supplier_id'] ?? null,
            'supplier_name_text' => $data['supplier_name_text'] ?? null,
            'unit_price_laar' => (int) $data['unit_price_laar'],
            'unit' => $data['unit'] ?? $item->requested_unit,
            'note' => $data['note'] ?? null,
            'quoted_by' => $user->id,
        ]);

        $this->auditItem(
            'purchase_request.quote_added',
            $item->fresh(),
            [],
            ['quote_id' => $quote->id, 'unit_price_laar' => $quote->unit_price_laar],
            $request,
            $user,
        );

        return $quote->fresh(['supplier']);
    }

    public function removeQuote(PurchaseRequestItem $item, PurchaseRequestItemQuote $quote, User $user, Request $request): void
    {
        $this->assertCanBuy($item, $user);

        if ((int) $quote->purchase_request_item_id !== (int) $item->id) {
            throw ValidationException::withMessages(['quote' => ['Quote does not belong to this line.']]);
        }

        $quoteId = $quote->id;
        $quote->delete();

        $this->auditItem(
            'purchase_request.quote_removed',
            $item->fresh(),
            ['quote_id' => $quoteId],
            [],
            $request,
            $user,
        );
    }

    public function cheapestQuote(PurchaseRequestItem $item): ?PurchaseRequestItemQuote
    {
        return PurchaseRequestItemQuote::query()
            ->where('purchase_request_item_id', $item->id)
            ->orderBy('unit_price_laar')
            ->orderBy('id')
            ->first();
    }

    /**
     * Savings vs historical cheapest (laari), else vs the highest other quote on the line.
     */
    private function quoteSavingsLaar(
        PurchaseRequestItem $item,
        PurchaseRequestItemQuote $selected,
        float $qty,
        ?int $paidUnitLaar,
    ): int {
        if ($paidUnitLaar === null || $qty <= 0) {
            return 0;
        }

        $benchmarkLaar = null;
        if ($item->inventory_item_id) {
            $hints = app(PurchaseRequestPriceHintService::class)->hintsForItems([(int) $item->inventory_item_id]);
            $hist = $hints[(int) $item->inventory_item_id]['cheapest']['unit_price'] ?? null;
            if ($hist !== null) {
                // supplier_price_history stores MVR; convert to laari
                $benchmarkLaar = (int) round(((float) $hist) * 100);
            }
        }

        if ($benchmarkLaar === null) {
            $otherMax = PurchaseRequestItemQuote::query()
                ->where('purchase_request_item_id', $item->id)
                ->where('id', '!=', $selected->id)
                ->max('unit_price_laar');
            $benchmarkLaar = $otherMax !== null ? (int) $otherMax : null;
        }

        if ($benchmarkLaar === null) {
            return 0;
        }

        return max(0, (int) round(($benchmarkLaar - $paidUnitLaar) * $qty));
    }

    /** @param array<string, mixed> $data */
    public function markPartial(PurchaseRequestItem $item, User $user, array $data, Request $request): PurchaseRequestItem
    {
        $this->assertCanBuy($item, $user);

        return DB::transaction(function () use ($item, $user, $data, $request) {
            $qty = (float) ($data['actual_qty'] ?? 0);
            if ($qty <= 0) {
                throw ValidationException::withMessages(['actual_qty' => ['Partial quantity must be greater than zero.']]);
            }

            $unitCostLaar = isset($data['actual_unit_cost_laar']) ? (int) $data['actual_unit_cost_laar'] : null;
            $totalLaar = $unitCostLaar !== null ? (int) round($qty * $unitCostLaar) : null;

            $item->update([
                'status' => 'partially_bought',
                'actual_qty' => $qty,
                'actual_unit' => $data['actual_unit'] ?? $item->requested_unit,
                'actual_unit_cost_laar' => $unitCostLaar,
                'actual_total_laar' => $totalLaar,
                'supplier_id' => $data['supplier_id'] ?? $item->supplier_id,
                'supplier_name_text' => $data['supplier_name_text'] ?? $item->supplier_name_text,
                'buyer_notes' => $data['buyer_notes'] ?? $item->buyer_notes,
                'bought_at' => now(),
            ]);

            $pr = $item->purchaseRequest;
            $this->recomputeTotals($pr);
            $this->recomputeRequestStatus($pr);
            $this->auditItem('purchase_request.partial', $item->fresh(), [], ['status' => 'partially_bought'], $request, $user);

            return $item->fresh(['purchaseRequest']);
        });
    }

    public function markNotAvailable(PurchaseRequestItem $item, User $user, ?string $notes, Request $request): PurchaseRequestItem
    {
        $this->assertCanBuy($item, $user);

        return DB::transaction(function () use ($item, $user, $notes, $request) {
            $item->update([
                'status' => 'not_available',
                'buyer_notes' => $notes ?? $item->buyer_notes,
                'bought_at' => now(),
            ]);

            $pr = $item->purchaseRequest;
            $this->recomputeRequestStatus($pr);
            $this->auditItem('purchase_request.not_available', $item->fresh(), [], ['status' => 'not_available'], $request, $user);

            return $item->fresh(['purchaseRequest']);
        });
    }

    /** @param list<int> $sourceIds */
    public function merge(PurchaseRequest $target, array $sourceIds, User $user, Request $request): PurchaseRequest
    {
        return DB::transaction(function () use ($target, $sourceIds, $user, $request) {
            foreach ($sourceIds as $sourceId) {
                if ((int) $sourceId === $target->id) {
                    continue;
                }
                $source = PurchaseRequest::with('items')->findOrFail($sourceId);
                if ($source->isTerminal()) {
                    continue;
                }
                foreach ($source->items as $line) {
                    $line->update(['purchase_request_id' => $target->id, 'status' => 'pending']);
                }
                $source->update(['status' => 'cancelled', 'merged_into_id' => $target->id]);
                $this->auditPurchaseRequest('purchase_request.merged', $source, ['status' => $source->getOriginal('status')], ['status' => 'cancelled', 'merged_into_id' => $target->id], $request, $user);
            }

            $this->recomputeTotals($target->fresh());
            $this->auditPurchaseRequest('purchase_request.merged', $target->fresh(), [], ['merged_sources' => $sourceIds], $request, $user);

            return $target->fresh(['items', 'requester', 'assignee']);
        });
    }

    public function recomputeTotals(PurchaseRequest $pr): void
    {
        $pr->load('items');
        $estimated = 0;
        $actual = 0;
        foreach ($pr->items as $item) {
            if ($item->estimated_unit_cost_laar) {
                $estimated += (int) round((float) $item->requested_qty * $item->estimated_unit_cost_laar);
            }
            if ($item->actual_total_laar) {
                $actual += $item->actual_total_laar;
            }
        }
        $pr->update([
            'total_estimated_laar' => $estimated ?: null,
            'total_actual_laar' => $actual ?: null,
        ]);
    }

    public function recomputeRequestStatus(PurchaseRequest $pr): void
    {
        $pr->load('items');
        $statuses = $pr->items->pluck('status')->all();
        if (empty($statuses)) {
            return;
        }

        $allTerminal = collect($statuses)->every(fn ($s) => in_array($s, PurchaseRequestItem::TERMINAL_STATUSES, true));
        $anyBought = collect($statuses)->contains(fn ($s) => in_array($s, ['bought', 'partially_bought'], true));
        $anyPartial = in_array('partially_bought', $statuses, true);
        $allBoughtPending = collect($statuses)->every(fn ($s) => in_array($s, ['bought', 'partially_bought', 'not_available', 'received'], true));

        if ($allTerminal && collect($statuses)->contains('received')) {
            $pr->update(['status' => 'closed']);

            return;
        }

        if ($allBoughtPending && $anyBought) {
            $pr->update(['status' => 'bought_pending_verification']);

            return;
        }

        if ($anyPartial || ($anyBought && !$allBoughtPending)) {
            $pr->update(['status' => 'partially_bought']);

            return;
        }

        if ($anyBought) {
            $pr->update(['status' => 'buying']);
        }
    }

    public function assertCanBuy(PurchaseRequestItem $item, User $user): void
    {
        $pr = $item->purchaseRequest;
        if ($pr->isTerminal() || in_array($pr->status, ['requested', 'approved', 'rejected'], true)) {
            throw ValidationException::withMessages(['request' => ['Request is not open for buying.']]);
        }
        if (in_array($item->status, PurchaseRequestItem::TERMINAL_STATUSES, true)) {
            throw ValidationException::withMessages(['item' => ['Item is already closed.']]);
        }

        $isAssignee = $pr->assigned_to === $user->id;
        $canViewAll = $user->hasPermission('purchase_requests.view_all');

        if (!$isAssignee && !$canViewAll) {
            throw ValidationException::withMessages(['assign' => ['You are not assigned to buy for this request.']]);
        }
    }

    public function canView(PurchaseRequest $pr, User $user): bool
    {
        if ($user->hasPermission('purchase_requests.view_all')) {
            return true;
        }
        if (!$user->hasPermission('purchase_requests.view_own')) {
            return false;
        }

        return $pr->requested_by === $user->id || $pr->assigned_to === $user->id;
    }

    /** @return list<string> */
    public function similarInventoryWarnings(?string $name): array
    {
        if (!$name || trim($name) === '') {
            return [];
        }

        return InventoryItem::query()
            ->where('is_active', true)
            ->where('name', 'like', '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim($name)) . '%')
            ->limit(5)
            ->pluck('name')
            ->all();
    }

    /**
     * Promote a free-text request line into the inventory catalog (idempotent on name).
     *
     * @param array<string, mixed> $data
     * @return array{item: PurchaseRequestItem, inventory_item: InventoryItem, created: bool}
     */
    public function promoteToInventory(PurchaseRequestItem $item, array $data, User $user, Request $request): array
    {
        if ($item->inventory_item_id) {
            $existing = InventoryItem::findOrFail($item->inventory_item_id);

            return ['item' => $item->fresh(['inventoryItem']), 'inventory_item' => $existing, 'created' => false];
        }

        $name = trim((string) ($data['name'] ?? $item->free_text_name ?? ''));
        if ($name === '') {
            throw ValidationException::withMessages(['name' => ['A name is required to add this item to the catalog.']]);
        }

        $unit = trim((string) ($data['unit'] ?? $item->requested_unit ?? ''));
        if ($unit === '') {
            throw ValidationException::withMessages(['unit' => ['Unit is required.']]);
        }

        return DB::transaction(function () use ($item, $data, $user, $request, $name, $unit) {
            $existing = InventoryItem::query()
                ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
                ->first();

            $created = false;
            if ($existing) {
                $inventory = $existing;
            } else {
                $inventory = InventoryItem::create([
                    'name' => $name,
                    'unit' => $unit,
                    'current_stock' => 0,
                    'reorder_point' => isset($data['reorder_point']) ? (float) $data['reorder_point'] : null,
                    'reorder_quantity' => isset($data['reorder_quantity']) ? (float) $data['reorder_quantity'] : null,
                    'inventory_category_id' => $data['category_id'] ?? null,
                    'is_active' => true,
                ]);
                $created = true;
            }

            $old = ['inventory_item_id' => $item->inventory_item_id, 'free_text_name' => $item->free_text_name];
            $item->update([
                'inventory_item_id' => $inventory->id,
                // Keep free_text_name for history; displayName prefers inventory name when linked.
            ]);

            $this->auditItem('purchase_request.promoted_to_inventory', $item->fresh(), $old, [
                'inventory_item_id' => $inventory->id,
                'inventory_item_name' => $inventory->name,
                'created' => $created,
            ], $request, $user);

            return [
                'item' => $item->fresh(['inventoryItem']),
                'inventory_item' => $inventory,
                'created' => $created,
            ];
        });
    }

    /** @param array<string, mixed> $old */
    /** @param array<string, mixed> $new */
    private function auditPurchaseRequest(string $action, PurchaseRequest $pr, array $old, array $new, Request $request, User $user, array $meta = []): void
    {
        $this->audit->log($action, 'PurchaseRequest', $pr->id, $old, $new, array_merge([
            'request_id' => $pr->id,
            'role' => $user->role?->slug,
            'user_id' => $user->id,
        ], $meta), $request);
    }

    /** @param array<string, mixed> $old */
    /** @param array<string, mixed> $new */
    private function auditItem(string $action, PurchaseRequestItem $item, array $old, array $new, Request $request, User $user): void
    {
        $this->audit->log($action, 'PurchaseRequestItem', $item->id, $old, $new, [
            'request_id' => $item->purchase_request_id,
            'item_id' => $item->id,
            'role' => $user->role?->slug,
            'user_id' => $user->id,
        ], $request);
    }
}
