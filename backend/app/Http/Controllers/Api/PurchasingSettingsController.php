<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Finance\Services\NonStockPurchaseExpenseService;
use App\Domains\Inventory\Services\BackdatePolicy;
use App\Http\Controllers\Controller;
use App\Models\ExpenseCategory;
use App\Models\SiteSetting;
use App\Services\ExpenseBudgetService;
use App\Services\PurchaseRequestPriceHintService;
use App\Services\PurchaseRequestVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Every switch that governs buying, on one endpoint.
 *
 * Purchasing settings audit, 2026-09-05. Thirteen settings shape how a
 * request becomes a purchase becomes a cost. They were reachable through four
 * different screens — six of them inside the Purchase Requests queue, one on
 * Expenses, one under System settings, one under Notifications — and four had
 * no screen at all, so the backdate window, the restock waste rules and budget
 * enforcement could only be changed in the database.
 *
 * Nothing here is a new setting. Each key is the one its service already
 * reads, so turning a switch on this screen is exactly turning it where it
 * used to be. The old per-screen endpoints keep working; this is the one the
 * Purchasing → Settings tab uses.
 */
class PurchasingSettingsController extends Controller
{
    private const KEY_AUTO_APPROVE = 'purchase_requests_auto_approve_under_laar';

    private const KEY_AUTO_ON_LOW_STOCK = 'purchase_requests_auto_on_low_stock';

    private const KEY_RECURRING_LISTS = 'purchase_requests_recurring_lists_enabled';

    private const KEY_STOCK_VARIANCE = 'stock_variance_reason_mvr';

    private const KEY_RESTOCK_INCLUDE_WASTE = 'restock_include_waste';

    private const KEY_RESTOCK_HIGH_WASTE = 'restock_high_waste_pct';

    private const KEY_REORDER_SMS = 'ops_inventory_reorder_alert_sms';

    public function show(): JsonResponse
    {
        return response()->json(['settings' => $this->current()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            // Requesting
            'auto_request_on_low_stock' => ['sometimes', 'boolean'],
            'recurring_lists_enabled' => ['sometimes', 'boolean'],
            // Approving
            'auto_approve_under_mvr' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1000000'],
            // Buying
            'show_price_hints' => ['sometimes', 'boolean'],
            'backdate_max_days' => ['sometimes', 'integer', 'min:0', 'max:3650'],
            // Receiving
            'stock_variance_reason_mvr' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1000000'],
            // Costing
            'auto_expense_on_verify' => ['sometimes', 'boolean'],
            'default_expense_category_id' => ['sometimes', 'nullable', 'integer', Rule::exists('expense_categories', 'id')],
            'auto_expense_non_stock_purchases' => ['sometimes', 'boolean'],
            'enforce_expense_budgets' => ['sometimes', 'boolean'],
            // Restocking
            'restock_include_waste' => ['sometimes', 'boolean'],
            'restock_high_waste_pct' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'reorder_alert_sms' => ['sometimes', 'boolean'],
        ]);

        $bool = fn (string $k): string => filter_var($data[$k], FILTER_VALIDATE_BOOLEAN) ? '1' : '0';

        if (array_key_exists('auto_request_on_low_stock', $data)) {
            SiteSetting::set(self::KEY_AUTO_ON_LOW_STOCK, $bool('auto_request_on_low_stock'));
        }
        if (array_key_exists('recurring_lists_enabled', $data)) {
            SiteSetting::set(self::KEY_RECURRING_LISTS, $bool('recurring_lists_enabled'));
        }
        if (array_key_exists('auto_approve_under_mvr', $data)) {
            $mvr = $data['auto_approve_under_mvr'];
            $laar = ($mvr === null || $mvr === '') ? 0 : (int) round(((float) $mvr) * 100);
            SiteSetting::set(self::KEY_AUTO_APPROVE, (string) max(0, $laar));
        }
        if (array_key_exists('show_price_hints', $data)) {
            SiteSetting::set(PurchaseRequestPriceHintService::SHOW_HINTS_SETTING, $bool('show_price_hints'));
        }
        if (array_key_exists('backdate_max_days', $data)) {
            SiteSetting::set(BackdatePolicy::SETTING_KEY, (string) (int) $data['backdate_max_days']);
        }
        if (array_key_exists('stock_variance_reason_mvr', $data)) {
            $v = $data['stock_variance_reason_mvr'];
            SiteSetting::set(self::KEY_STOCK_VARIANCE, ($v === null || $v === '') ? '0' : (string) round((float) $v, 2));
        }
        if (array_key_exists('auto_expense_on_verify', $data)) {
            SiteSetting::set(PurchaseRequestVerificationService::AUTO_EXPENSE_SETTING, $bool('auto_expense_on_verify'));
        }
        if (array_key_exists('default_expense_category_id', $data)) {
            $id = $data['default_expense_category_id'];
            SiteSetting::set(
                PurchaseRequestVerificationService::DEFAULT_CATEGORY_SETTING,
                ($id === null || $id === '') ? null : (string) (int) $id,
            );
        }
        if (array_key_exists('auto_expense_non_stock_purchases', $data)) {
            SiteSetting::set(NonStockPurchaseExpenseService::SETTING_KEY, $bool('auto_expense_non_stock_purchases'));
        }
        if (array_key_exists('enforce_expense_budgets', $data)) {
            SiteSetting::set(ExpenseBudgetService::ENFORCE_SETTING, $bool('enforce_expense_budgets'));
        }
        if (array_key_exists('restock_include_waste', $data)) {
            SiteSetting::set(self::KEY_RESTOCK_INCLUDE_WASTE, $bool('restock_include_waste'));
        }
        if (array_key_exists('restock_high_waste_pct', $data)) {
            SiteSetting::set(self::KEY_RESTOCK_HIGH_WASTE, (string) round((float) $data['restock_high_waste_pct'], 1));
        }
        if (array_key_exists('reorder_alert_sms', $data)) {
            SiteSetting::set(self::KEY_REORDER_SMS, $bool('reorder_alert_sms'));
        }

        SiteSetting::bust();

        return response()->json([
            'message' => 'Purchasing settings saved.',
            'settings' => $this->current(),
        ]);
    }

    /** @return array<string, mixed> */
    private function current(): array
    {
        $flag = fn (string $key, string $default): bool => filter_var(SiteSetting::get($key, $default), FILTER_VALIDATE_BOOLEAN);
        $thresholdLaar = (int) SiteSetting::get(self::KEY_AUTO_APPROVE, '0');
        $categoryRaw = SiteSetting::get(PurchaseRequestVerificationService::DEFAULT_CATEGORY_SETTING);
        $categoryId = ($categoryRaw !== null && $categoryRaw !== '') ? (int) $categoryRaw : null;

        return [
            'auto_request_on_low_stock' => $flag(self::KEY_AUTO_ON_LOW_STOCK, '0'),
            'recurring_lists_enabled' => $flag(self::KEY_RECURRING_LISTS, '0'),
            'auto_approve_under_mvr' => round($thresholdLaar / 100, 2),
            'show_price_hints' => $flag(PurchaseRequestPriceHintService::SHOW_HINTS_SETTING, '1'),
            'backdate_max_days' => BackdatePolicy::maxDays(),
            'stock_variance_reason_mvr' => (float) SiteSetting::get(self::KEY_STOCK_VARIANCE, '0'),
            'auto_expense_on_verify' => $flag(PurchaseRequestVerificationService::AUTO_EXPENSE_SETTING, '0'),
            'default_expense_category_id' => $categoryId,
            'auto_expense_non_stock_purchases' => $flag(NonStockPurchaseExpenseService::SETTING_KEY, '0'),
            'enforce_expense_budgets' => $flag(ExpenseBudgetService::ENFORCE_SETTING, '0'),
            'restock_include_waste' => $flag(self::KEY_RESTOCK_INCLUDE_WASTE, '0'),
            'restock_high_waste_pct' => (float) SiteSetting::get(self::KEY_RESTOCK_HIGH_WASTE, '15'),
            'reorder_alert_sms' => $flag(self::KEY_REORDER_SMS, '0'),
            // For the category picker, so the screen needs one call.
            'expense_categories' => ExpenseCategory::query()->orderBy('name')->get(['id', 'name'])
                ->map(fn ($c) => ['id' => $c->id, 'name' => $c->name])->all(),
        ];
    }
}
