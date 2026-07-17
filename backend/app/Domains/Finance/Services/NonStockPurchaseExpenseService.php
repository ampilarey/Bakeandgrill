<?php

declare(strict_types=1);

namespace App\Domains\Finance\Services;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Purchase;
use App\Models\SiteSetting;
use App\Models\User;

/**
 * Optional (off by default): when a purchase has non-stock lines
 * (no inventory_item_id) that are received, create/update a pending Expense
 * linked to the PO. Stock lines are never auto-expensed (they stay in COGS).
 */
final class NonStockPurchaseExpenseService
{
    public const SETTING_KEY = 'finance_auto_expense_non_stock_purchases';

    public const NOTE_MARKER = 'auto:non_stock_purchase';

    public function enabled(): bool
    {
        $raw = SiteSetting::get(self::SETTING_KEY, '0');

        return filter_var($raw, FILTER_VALIDATE_BOOLEAN);
    }

    /** @return array{auto_expense_non_stock_purchases: bool} */
    public function settings(): array
    {
        return [
            'auto_expense_non_stock_purchases' => $this->enabled(),
        ];
    }

    /** @param array<string, mixed> $input */
    public function updateSettings(array $input): array
    {
        if (array_key_exists('auto_expense_non_stock_purchases', $input)) {
            SiteSetting::set(
                self::SETTING_KEY,
                filter_var($input['auto_expense_non_stock_purchases'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
            );
            SiteSetting::bust();
        }

        return $this->settings();
    }

    /**
     * Upsert a pending expense for received non-stock lines on this purchase.
     * Returns null when disabled, nothing to expense, or amount is zero.
     */
    public function syncForPurchase(Purchase $purchase, ?User $user = null): ?Expense
    {
        if (! $this->enabled()) {
            return null;
        }

        $purchase->loadMissing('items');

        $amount = 0.0;
        $lineCount = 0;
        foreach ($purchase->items as $item) {
            if ($item->inventory_item_id) {
                continue;
            }
            if (in_array((string) ($item->receive_status ?? ''), ['rejected'], true)) {
                continue;
            }
            $qty = (float) ($item->received_quantity ?? 0);
            if ($qty <= 0) {
                continue;
            }
            $amount += $qty * (float) $item->unit_cost;
            $lineCount++;
        }

        $amount = round($amount, 2);
        $existing = Expense::query()
            ->where('purchase_id', $purchase->id)
            ->where('notes', 'like', '%'.self::NOTE_MARKER.'%')
            ->first();

        if ($amount <= 0 || $lineCount === 0) {
            // If previously auto-created and lines were undone, leave the expense
            // for manual cleanup — do not auto-delete approved expenses.
            return $existing;
        }

        $category = ExpenseCategory::query()->orderBy('id')->first();
        $number = 'EXP-PO-'.($purchase->purchase_number ?? $purchase->id).'-NS';
        $description = 'Non-stock purchase '.$purchase->purchase_number
            .' ('.$lineCount.' line'.($lineCount === 1 ? '' : 's').')';
        $notes = self::NOTE_MARKER.' — auto-created from PO receive. Stock inventory lines are excluded.';

        if ($existing) {
            // Never overwrite an approved/rejected expense automatically.
            if (in_array((string) $existing->status, ['approved', 'rejected'], true)) {
                return $existing;
            }
            $existing->update([
                'description' => $description,
                'amount' => $amount,
                'amount_laar' => (int) round($amount * 100),
                'expense_date' => $purchase->actual_delivery_date?->toDateString()
                    ?? $purchase->purchase_date?->toDateString()
                    ?? now()->toDateString(),
                'supplier_id' => $purchase->supplier_id,
                'notes' => $notes,
            ]);

            return $existing->fresh(['category', 'supplier', 'purchase']);
        }

        return Expense::create([
            'expense_number' => $number,
            'expense_category_id' => $category?->id ?? 1,
            'supplier_id' => $purchase->supplier_id,
            'user_id' => $user?->id,
            'purchase_id' => $purchase->id,
            'description' => $description,
            'amount' => $amount,
            'amount_laar' => (int) round($amount * 100),
            'expense_date' => $purchase->actual_delivery_date?->toDateString()
                ?? $purchase->purchase_date?->toDateString()
                ?? now()->toDateString(),
            'status' => 'pending',
            'payment_method' => 'other',
            'notes' => $notes,
        ])->fresh(['category', 'supplier', 'purchase']);
    }
}
