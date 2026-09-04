<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\SiteSetting;
use App\Models\StockMovement;
use App\Models\SupplierPriceHistory;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class PurchaseRequestVerificationService
{
    public const AUTO_EXPENSE_SETTING = 'purchase_requests_auto_expense';

    public const DEFAULT_CATEGORY_SETTING = 'purchase_requests_default_expense_category_id';

    public function __construct(
        private readonly AuditLogService $audit,
        private readonly PurchaseRequestService $requests,
    ) {}

    /** @param array<string, mixed> $data */
    public function verifyItem(PurchaseRequestItem $item, User $user, array $data, Request $request): array
    {
        if (!in_array($item->status, ['bought', 'partially_bought'], true)) {
            throw ValidationException::withMessages(['status' => ['Only bought items can be verified.']]);
        }

        $pr = $item->purchaseRequest;
        if ($pr->isTerminal()) {
            throw ValidationException::withMessages(['request' => ['Request is closed.']]);
        }

        return DB::transaction(function () use ($item, $user, $data, $request, $pr) {
            $inventoryId = $data['inventory_item_id'] ?? $item->inventory_item_id;
            $warnings = [];

            if (!$inventoryId && !empty($data['free_text_name'])) {
                $warnings = $this->requests->similarInventoryWarnings($data['free_text_name']);
            }

            if ($inventoryId) {
                $item->update(['inventory_item_id' => $inventoryId]);
                $this->applyStockIn($item->fresh(), $inventoryId, $user, $request);
            }

            $item->update([
                'status' => 'received',
                'received_at' => now(),
                'verified_notes' => $data['verified_notes'] ?? $item->verified_notes,
            ]);

            $this->audit->log(
                'purchase_request.verified',
                'PurchaseRequestItem',
                $item->id,
                ['status' => 'bought'],
                ['status' => 'received'],
                ['request_id' => $pr->id, 'item_id' => $item->id, 'role' => $user->role?->slug],
                $request,
            );

            $pr->update(['verified_by' => $user->id, 'status' => 'received']);
            $this->requests->recomputeRequestStatus($pr->fresh());

            $freshPr = $pr->fresh(['items', 'requester', 'assignee']);
            if ($freshPr->status === 'closed') {
                $freshPr->update(['status' => 'closed']);
            }

            $this->maybeAutoExpense($freshPr, $user, $request);
            $freshPr = $freshPr->fresh(['items', 'requester', 'assignee', 'expense']);

            return [
                'item' => $item->fresh(['inventoryItem', 'purchaseRequest']),
                'request' => $freshPr,
                'warnings' => $warnings,
            ];
        });
    }

    public function verifyAll(PurchaseRequest $pr, User $user, Request $request): PurchaseRequest
    {
        $items = $pr->items()->whereIn('status', ['bought', 'partially_bought'])->get();
        if ($items->isEmpty()) {
            throw ValidationException::withMessages(['items' => ['No bought items to verify.']]);
        }

        foreach ($items as $item) {
            $this->verifyItem($item, $user, [], $request);
        }

        $pr->refresh();
        $pr->update(['status' => 'closed', 'verified_by' => $user->id]);
        $this->maybeAutoExpense($pr->fresh(), $user, $request);

        return $pr->fresh(['items', 'requester', 'assignee', 'verifier', 'expense']);
    }

    public function convertToPurchase(PurchaseRequest $pr, User $user, Request $request): Purchase
    {
        if ($pr->purchase_id) {
            return Purchase::with('items')->findOrFail($pr->purchase_id);
        }

        return DB::transaction(function () use ($pr, $user, $request) {
            $pr->load('items');
            $supplierId = $pr->items->first()?->supplier_id;
            $purchase = Purchase::create([
                'purchase_number' => 'PO-PR-' . $pr->request_no,
                'supplier_id' => $supplierId,
                'user_id' => $user->id,
                'status' => 'draft',
                'subtotal' => ($pr->total_actual_laar ?? 0) / 100,
                'total' => ($pr->total_actual_laar ?? 0) / 100,
                'total_laar' => $pr->total_actual_laar ?? 0,
                'notes' => 'From purchase request ' . $pr->request_no,
                'purchase_date' => now()->toDateString(),
            ]);

            $allAlreadyStocked = true;
            $anyLine = false;

            foreach ($pr->items as $line) {
                if (!$line->inventory_item_id) {
                    continue;
                }
                $anyLine = true;
                $qty = (float) ($line->actual_qty ?? $line->approved_qty ?? $line->requested_qty);
                $unitCost = ($line->actual_unit_cost_laar ?? 0) / 100;

                // Verify already applied stock via applyStockIn — mark PO line complete
                // so PurchaseWorkflowController::receive does not double-count.
                $alreadyStocked = $line->status === 'received'
                    || StockMovement::query()
                        ->where('reference_type', 'purchase_request')
                        ->where('reference_id', $pr->id)
                        ->where('inventory_item_id', $line->inventory_item_id)
                        ->exists();

                if (!$alreadyStocked) {
                    $allAlreadyStocked = false;
                }

                PurchaseItem::create([
                    'purchase_id' => $purchase->id,
                    'inventory_item_id' => $line->inventory_item_id,
                    'quantity' => $qty,
                    'unit_cost' => $unitCost,
                    'total_cost' => round($qty * $unitCost, 2),
                    'received_quantity' => $alreadyStocked ? $qty : 0,
                    'receive_status' => $alreadyStocked ? 'complete' : 'pending',
                    'received_at' => $alreadyStocked ? now() : null,
                ]);
            }

            if ($anyLine && $allAlreadyStocked) {
                $purchase->update(['status' => 'received']);
            }

            $pr->update(['purchase_id' => $purchase->id]);

            $this->audit->log('purchase_request.converted_purchase', 'PurchaseRequest', $pr->id, [], ['purchase_id' => $purchase->id], [
                'request_id' => $pr->id,
                'role' => $user->role?->slug,
            ], $request);

            return $purchase->fresh(['items', 'supplier']);
        });
    }

    public function convertToExpense(PurchaseRequest $pr, User $user, Request $request): Expense
    {
        if ($pr->expense_id) {
            return Expense::findOrFail($pr->expense_id);
        }

        return DB::transaction(function () use ($pr, $user, $request) {
            $category = $this->resolveExpenseCategory();
            $amountLaar = $pr->total_actual_laar ?? 0;
            $receiptPath = $pr->attachments()->where('type', 'receipt')->latest('id')->value('file_path');

            if ($category) {
                $budget = app(ExpenseBudgetService::class);
                $status = $budget->statusForCategory((int) $category->id, (int) $amountLaar);
                if ($status['over_budget'] && $budget->enforceEnabled()) {
                    throw ValidationException::withMessages([
                        'expense' => ['Converting this request would exceed the monthly category budget.'],
                    ]);
                }
            }

            $expense = Expense::create([
                'expense_number' => 'EXP-PR-' . $pr->request_no,
                'expense_category_id' => $category?->id ?? 1,
                'supplier_id' => $pr->items->first()?->supplier_id,
                'user_id' => $user->id,
                'description' => 'Purchase request ' . $pr->request_no . ($pr->title ? ': ' . $pr->title : ''),
                'amount_laar' => $amountLaar,
                'amount' => $amountLaar / 100,
                // The day the money left, not the day the paperwork caught up.
                // Falls back to today when no line records when it was bought.
                'expense_date' => $this->purchaseDateFor($pr),
                'status' => 'pending',
                'receipt_path' => $receiptPath,
                'notes' => $pr->notes,
            ]);

            $pr->update(['expense_id' => $expense->id]);

            $this->audit->log('purchase_request.converted_expense', 'PurchaseRequest', $pr->id, [], ['expense_id' => $expense->id], [
                'request_id' => $pr->id,
                'role' => $user->role?->slug,
            ], $request);

            return $expense->fresh(['category', 'supplier']);
        });
    }

    /**
     * When auto-expense is ON and the request is fully verified (closed) with a
     * positive actual total and no linked expense yet, create a pending expense.
     */
    public function maybeAutoExpense(PurchaseRequest $pr, User $user, Request $request): ?Expense
    {
        if (!$this->autoExpenseEnabled()) {
            return null;
        }

        $pr->refresh();
        if ($pr->expense_id) {
            return Expense::find($pr->expense_id);
        }

        if ($pr->status !== 'closed') {
            return null;
        }

        if (($pr->total_actual_laar ?? 0) <= 0) {
            return null;
        }

        return $this->convertToExpense($pr, $user, $request);
    }

    public function autoExpenseEnabled(): bool
    {
        return filter_var(SiteSetting::get(self::AUTO_EXPENSE_SETTING, '0'), FILTER_VALIDATE_BOOLEAN);
    }

    /** @return array<string, mixed> */
    public function autoExpenseSettings(): array
    {
        $raw = SiteSetting::get(self::DEFAULT_CATEGORY_SETTING);
        $threshold = (int) SiteSetting::get('purchase_requests_auto_approve_under_laar', '0');

        return [
            'auto_expense' => $this->autoExpenseEnabled(),
            'default_expense_category_id' => ($raw !== null && $raw !== '') ? (int) $raw : null,
            'show_price_hints' => filter_var(SiteSetting::get('purchase_requests_show_price_hints', '1'), FILTER_VALIDATE_BOOLEAN),
            'auto_on_low_stock' => filter_var(SiteSetting::get('purchase_requests_auto_on_low_stock', '0'), FILTER_VALIDATE_BOOLEAN),
            'auto_approve_under_laar' => $threshold,
            'auto_approve_under_mvr' => round($threshold / 100, 2),
            'recurring_lists_enabled' => filter_var(SiteSetting::get('purchase_requests_recurring_lists_enabled', '0'), FILTER_VALIDATE_BOOLEAN),
        ];
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function updateAutoExpenseSettings(array $input): array
    {
        if (array_key_exists('auto_expense', $input)) {
            SiteSetting::set(
                self::AUTO_EXPENSE_SETTING,
                filter_var($input['auto_expense'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
            );
        }

        if (array_key_exists('default_expense_category_id', $input)) {
            $id = $input['default_expense_category_id'];
            SiteSetting::set(
                self::DEFAULT_CATEGORY_SETTING,
                $id === null || $id === '' ? null : (string) (int) $id,
            );
        }

        if (array_key_exists('show_price_hints', $input)) {
            SiteSetting::set(
                'purchase_requests_show_price_hints',
                filter_var($input['show_price_hints'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
            );
        }

        if (array_key_exists('auto_on_low_stock', $input)) {
            SiteSetting::set(
                'purchase_requests_auto_on_low_stock',
                filter_var($input['auto_on_low_stock'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
            );
        }

        if (array_key_exists('auto_approve_under_mvr', $input)) {
            $mvr = $input['auto_approve_under_mvr'];
            $laar = $mvr === null || $mvr === '' ? 0 : (int) round(((float) $mvr) * 100);
            SiteSetting::set('purchase_requests_auto_approve_under_laar', (string) max(0, $laar));
        } elseif (array_key_exists('auto_approve_under_laar', $input)) {
            SiteSetting::set(
                'purchase_requests_auto_approve_under_laar',
                (string) max(0, (int) $input['auto_approve_under_laar']),
            );
        }

        if (array_key_exists('recurring_lists_enabled', $input)) {
            SiteSetting::set(
                'purchase_requests_recurring_lists_enabled',
                filter_var($input['recurring_lists_enabled'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
            );
        }

        return $this->autoExpenseSettings();
    }

    private function resolveExpenseCategory(): ?ExpenseCategory
    {
        $raw = SiteSetting::get(self::DEFAULT_CATEGORY_SETTING);
        if ($raw !== null && $raw !== '') {
            $configured = ExpenseCategory::query()->find((int) $raw);
            if ($configured) {
                return $configured;
            }
        }

        return ExpenseCategory::query()->orderBy('id')->first();
    }

    private function applyStockIn(PurchaseRequestItem $item, int $inventoryItemId, User $user, Request $request): void
    {
        $invItem = InventoryItem::lockForUpdate()->findOrFail($inventoryItemId);
        $incomingQty = (float) ($item->actual_qty ?? $item->approved_qty ?? $item->requested_qty);
        if ($incomingQty <= 0) {
            return;
        }

        $idempotencyKey = 'purchase_request:' . $item->purchase_request_id . ':item:' . $item->id;
        if (StockMovement::where('idempotency_key', $idempotencyKey)->exists()) {
            return;
        }

        $unitCostLaar = $item->actual_unit_cost_laar ?? 0;
        $newCost = $unitCostLaar / 100;
        $oldStock = max(0, (float) ($invItem->current_stock ?? 0));
        $oldCost = (float) ($invItem->unit_cost ?? 0);

        $invItem->current_stock = $oldStock + $incomingQty;

        // Stock audit, 2026-09-03 (S1): a buy with no price recorded used to
        // average a cost of ZERO into the item — ten kilos at MVR 20 plus ten
        // kilos at nothing left the item costing MVR 10, and unit_cost is what
        // recipe cost, dish margin, break-even and the stock valuation all read.
        // No price means no opinion about cost: take the stock, keep the cost.
        $costRecorded = $newCost > 0;
        if ($costRecorded && $invItem->current_stock > 0) {
            $invItem->unit_cost = round(
                ($oldStock * $oldCost + $incomingQty * $newCost) / $invItem->current_stock,
                4,
            );
        }
        if ($costRecorded) {
            $invItem->last_purchase_price = $newCost;
        }
        $invItem->save();

        StockMovement::create([
            'idempotency_key' => $idempotencyKey,
            'inventory_item_id' => $invItem->id,
            'user_id' => $user->id,
            'type' => 'purchase',
            'quantity' => $incomingQty,
            'balance_after' => $invItem->current_stock,
            // Null, not zero: "we do not know what this cost", which a report
            // can tell apart from "this was free".
            'unit_cost' => $costRecorded ? $newCost : null,
            'reference_type' => 'purchase_request',
            'reference_id' => $item->purchase_request_id,
            'notes' => $costRecorded
                ? 'Verified from purchase request item #' . $item->id
                : 'Verified from purchase request item #' . $item->id . ' — no price recorded, item cost left unchanged',
            // The day the runner bought it, not the day it was verified. A
            // shop run verified on Monday still belongs to Saturday.
            'occurred_at' => StockMovement::occurredAtFor($item->bought_at),
        ]);

        if ($item->supplier_id && $newCost > 0) {
            SupplierPriceHistory::create([
                'supplier_id' => $item->supplier_id,
                'inventory_item_id' => $invItem->id,
                'purchase_id' => null,
                'unit_price' => $newCost,
                'unit' => $invItem->unit,
                // Dated when it was bought, so the 90-day "cheapest supplier"
                // window measures the price from the day it was actually paid.
                'recorded_at' => ($item->bought_at ?? now())->toDateString(),
            ]);
        }
    }

    /**
     * The day a request's buying happened, for the expense it raises.
     *
     * The earliest line wins: a runner who bought over two days should have the
     * expense sit on the first, which is when the money started leaving. Falls
     * back to today when no line ever recorded a date.
     */
    private function purchaseDateFor(PurchaseRequest $pr): string
    {
        $earliest = $pr->items()
            ->whereNotNull('bought_at')
            ->min('bought_at');

        return $earliest !== null
            ? Carbon::parse((string) $earliest)->toDateString()
            : now()->toDateString();
    }
}
