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
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class PurchaseRequestVerificationService
{
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

        return $pr->fresh(['items', 'requester', 'assignee', 'verifier']);
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

                if (! $alreadyStocked) {
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
            $category = ExpenseCategory::query()->orderBy('id')->first();
            $amountLaar = $pr->total_actual_laar ?? 0;
            $receiptPath = $pr->attachments()->where('type', 'receipt')->latest('id')->value('file_path');

            $expense = Expense::create([
                'expense_number' => 'EXP-PR-' . $pr->request_no,
                'expense_category_id' => $category?->id ?? 1,
                'supplier_id' => $pr->items->first()?->supplier_id,
                'user_id' => $user->id,
                'description' => 'Purchase request ' . $pr->request_no . ($pr->title ? ': ' . $pr->title : ''),
                'amount_laar' => $amountLaar,
                'amount' => $amountLaar / 100,
                'expense_date' => now()->toDateString(),
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

    private function applyStockIn(PurchaseRequestItem $item, int $inventoryItemId, User $user, Request $request): void
    {
        $invItem = InventoryItem::lockForUpdate()->findOrFail($inventoryItemId);
        $incomingQty = (float) ($item->actual_qty ?? $item->approved_qty ?? $item->requested_qty);
        if ($incomingQty <= 0) {
            return;
        }

        $idempotencyKey = 'purchase_request:'.$item->purchase_request_id.':item:'.$item->id;
        if (StockMovement::where('idempotency_key', $idempotencyKey)->exists()) {
            return;
        }

        $unitCostLaar = $item->actual_unit_cost_laar ?? 0;
        $newCost = $unitCostLaar / 100;
        $oldStock = max(0, (float) ($invItem->current_stock ?? 0));
        $oldCost = (float) ($invItem->unit_cost ?? 0);

        $invItem->current_stock = $oldStock + $incomingQty;
        if ($invItem->current_stock > 0) {
            $invItem->unit_cost = round(
                ($oldStock * $oldCost + $incomingQty * $newCost) / $invItem->current_stock,
                4,
            );
        }
        if ($newCost > 0) {
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
            'unit_cost' => $newCost,
            'reference_type' => 'purchase_request',
            'reference_id' => $item->purchase_request_id,
            'notes' => 'Verified from purchase request item #' . $item->id,
        ]);
    }
}
