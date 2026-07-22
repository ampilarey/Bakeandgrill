<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\SiteSetting;
use Carbon\Carbon;

final class ExpenseBudgetService
{
    public const ENFORCE_SETTING = 'expense_budgets_enforce';

    public function enforceEnabled(): bool
    {
        return filter_var(SiteSetting::get(self::ENFORCE_SETTING, '0'), FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * @return array{
     *     category_id: int,
     *     monthly_budget_laar: int|null,
     *     spent_laar: int,
     *     pending_add_laar: int,
     *     projected_laar: int,
     *     pct: float|null,
     *     over_budget: bool,
     *     near_budget: bool
     * }
     */
    public function statusForCategory(int $categoryId, int $pendingAddLaar = 0, ?Carbon $month = null): array
    {
        $month = $month?->copy()->startOfMonth() ?? now()->startOfMonth();
        $category = ExpenseCategory::query()->findOrFail($categoryId);
        $budget = $category->monthly_budget_laar !== null ? (int) $category->monthly_budget_laar : null;

        $spent = (int) Expense::query()
            ->where('expense_category_id', $categoryId)
            ->whereIn('status', ['pending', 'approved'])
            ->whereDate('expense_date', '>=', $month->toDateString())
            ->whereDate('expense_date', '<=', $month->copy()->endOfMonth()->toDateString())
            ->sum('amount_laar');

        $projected = $spent + max(0, $pendingAddLaar);
        $pct = $budget !== null && $budget > 0 ? round(($projected / $budget) * 100, 1) : null;
        $over = $budget !== null && $projected > $budget;
        $near = $budget !== null && !$over && $pct !== null && $pct >= 80;

        return [
            'category_id' => $categoryId,
            'monthly_budget_laar' => $budget,
            'spent_laar' => $spent,
            'pending_add_laar' => max(0, $pendingAddLaar),
            'projected_laar' => $projected,
            'pct' => $pct,
            'over_budget' => $over,
            'near_budget' => $near,
        ];
    }
}
