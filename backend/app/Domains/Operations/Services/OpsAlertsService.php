<?php

declare(strict_types=1);

namespace App\Domains\Operations\Services;

use App\Models\InventoryItem;
use App\Models\InventoryReorderAlert;
use App\Models\Item;
use App\Models\KitchenProductionBatch;
use App\Models\KitchenProductionVariance;
use App\Models\Order;
use App\Models\PurchaseRequest;
use App\Models\SiteSetting;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

final class OpsAlertsService
{
    public function settings(): array
    {
        return [
            'delivery_delay_alert_sms' => $this->bool('ops_delivery_delay_alert_sms', false),
            'inventory_reorder_alert_sms' => $this->bool('ops_inventory_reorder_alert_sms', false),
        ];
    }

    /** @param array<string, mixed> $input */
    public function updateSettings(array $input): array
    {
        if (array_key_exists('delivery_delay_alert_sms', $input)) {
            SiteSetting::set(
                'ops_delivery_delay_alert_sms',
                filter_var($input['delivery_delay_alert_sms'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
            );
            SiteSetting::bust();
        }

        if (array_key_exists('inventory_reorder_alert_sms', $input)) {
            SiteSetting::set(
                'ops_inventory_reorder_alert_sms',
                filter_var($input['inventory_reorder_alert_sms'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
            );
            SiteSetting::bust();
        }

        return $this->settings();
    }

    /**
     * Cross-module alert inbox for the owner health dashboard.
     *
     * @return list<array{type: string, severity: string, count: int, message: string, link: string|null}>
     */
    public function inbox(int $deliveryGraceMinutes = 15): array
    {
        $alerts = [];

        $delayed = $this->delayedDeliveryCount($deliveryGraceMinutes);
        if ($delayed > 0) {
            $alerts[] = [
                'type' => 'delivery_delay',
                'severity' => 'warning',
                'count' => $delayed,
                'message' => "{$delayed} delivery order(s) past estimated ready time",
                'link' => '/delivery-settings',
            ];
        }

        $lowStock = Item::query()
            ->where('track_stock', true)
            ->where('availability_type', 'stock_based')
            ->where('is_available', true)
            ->whereColumn('stock_quantity', '<=', 'low_stock_threshold')
            ->count();

        if ($lowStock > 0) {
            $alerts[] = [
                'type' => 'low_menu_stock',
                'severity' => 'warning',
                'count' => $lowStock,
                'message' => "{$lowStock} menu item(s) at or below low-stock threshold",
                'link' => '/inventory',
            ];
        }

        $negativeInventory = InventoryItem::query()
            ->where('is_active', true)
            ->where('current_stock', '<', 0)
            ->count();

        if ($negativeInventory > 0) {
            $alerts[] = [
                'type' => 'inventory_discrepancy',
                'severity' => 'critical',
                'count' => $negativeInventory,
                'message' => "{$negativeInventory} inventory SKU(s) with negative on-hand quantity",
                'link' => '/inventory',
            ];
        }

        $openReorderAlerts = InventoryReorderAlert::query()->whereNull('resolved_at')->count();
        if ($openReorderAlerts > 0) {
            $alerts[] = [
                'type' => 'inventory_reorder',
                'severity' => 'warning',
                'count' => $openReorderAlerts,
                'message' => "{$openReorderAlerts} inventory SKU(s) at or below reorder point",
                'link' => '/forecasts?section=restock',
            ];
        }

        $pendingRequests = PurchaseRequest::query()->where('status', 'requested')->count();
        if ($pendingRequests > 0) {
            $alerts[] = [
                'type' => 'purchase_requests_pending',
                'severity' => 'warning',
                'count' => $pendingRequests,
                'message' => "{$pendingRequests} purchase request(s) awaiting approval",
                'link' => '/purchase-requests',
            ];
        }

        $awaitingVerify = PurchaseRequest::query()->where('status', 'bought_pending_verification')->count();
        if ($awaitingVerify > 0) {
            $alerts[] = [
                'type' => 'purchase_requests_verify',
                'severity' => 'warning',
                'count' => $awaitingVerify,
                'message' => "{$awaitingVerify} purchase request(s) bought — pending verification",
                'link' => '/purchase-requests',
            ];
        }

        $overdueRequests = PurchaseRequest::query()
            ->whereNotIn('status', ['closed', 'cancelled', 'rejected', 'received'])
            ->whereNotNull('needed_by')
            ->where('needed_by', '<', now())
            ->count();
        if ($overdueRequests > 0) {
            $alerts[] = [
                'type' => 'purchase_requests_overdue',
                'severity' => 'critical',
                'count' => $overdueRequests,
                'message' => "{$overdueRequests} purchase request(s) past needed-by date",
                'link' => '/purchase-requests',
            ];
        }

        $pendingKitchenReceive = KitchenProductionBatch::query()->where('status', 'submitted')->count();
        if ($pendingKitchenReceive > 0) {
            $alerts[] = [
                'type' => 'kitchen_pending_receive',
                'severity' => 'warning',
                'count' => $pendingKitchenReceive,
                'message' => "{$pendingKitchenReceive} kitchen batch(es) awaiting POS receive",
                'link' => '/kitchen-production',
            ];
        }

        $openVariances = KitchenProductionVariance::query()->whereNull('reviewed_at')->count();
        if ($openVariances > 0) {
            $alerts[] = [
                'type' => 'kitchen_variances_open',
                'severity' => 'warning',
                'count' => $openVariances,
                'message' => "{$openVariances} kitchen variance(s) need manager review",
                'link' => '/kitchen-production',
            ];
        }

        return $alerts;
    }

    public function delayedDeliveryCount(int $graceMinutes = 15): int
    {
        return $this->delayedDeliveryQuery($graceMinutes)->count();
    }

    /**
     * @return Builder<Order>
     */
    public function delayedDeliveryQuery(int $graceMinutes = 15): Builder
    {
        $graceMinutes = max(5, $graceMinutes);
        $cutoff = now()->subMinutes($graceMinutes);

        return Order::query()
            ->where('type', 'delivery')
            ->whereIn('status', ['preparing', 'in_progress', 'ready', 'delivering', 'out_for_delivery', 'on_the_way'])
            ->where(function ($query) use ($cutoff): void {
                $query->where(function ($q) use ($cutoff): void {
                    $q->whereNotNull('delivery_eta_at')
                        ->where('delivery_eta_at', '<', $cutoff);
                })->orWhere(function ($q) use ($cutoff): void {
                    $q->whereNotNull('fired_at')
                        ->whereNotNull('estimated_wait_minutes')
                        ->where('estimated_wait_minutes', '>', 0);

                    if (DB::connection()->getDriverName() === 'sqlite') {
                        $q->whereRaw(
                            "datetime(fired_at, '+' || estimated_wait_minutes || ' minutes') < ?",
                            [$cutoff->toDateTimeString()],
                        );
                    } elseif (DB::connection()->getDriverName() === 'pgsql') {
                        $q->whereRaw(
                            "fired_at + (estimated_wait_minutes * INTERVAL '1 minute') < ?",
                            [$cutoff],
                        );
                    } else {
                        $q->whereRaw(
                            'DATE_ADD(fired_at, INTERVAL estimated_wait_minutes MINUTE) < ?',
                            [$cutoff],
                        );
                    }
                });
            });
    }

    private function bool(string $key, bool $default): bool
    {
        $raw = SiteSetting::get($key);
        if ($raw === null || $raw === '') {
            return $default;
        }

        return filter_var($raw, FILTER_VALIDATE_BOOLEAN);
    }
}
