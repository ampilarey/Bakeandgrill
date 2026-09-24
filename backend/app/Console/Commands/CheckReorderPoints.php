<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\InventoryItem;
use App\Models\InventoryReorderAlert;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CheckReorderPoints extends Command
{
    /** An open alert is mentioned again in the digest after this long. */
    public const REMIND_DAYS = 7;

    protected $signature = 'inventory:check-reorder';

    protected $description = 'Create reorder alerts for raw inventory items at or below their reorder point';

    public function handle(SmsService $sms): int
    {
        $today = now()->startOfDay();
        $items = InventoryItem::query()
            ->where('is_active', true)
            ->whereNotNull('reorder_point')
            ->whereColumn('current_stock', '<=', 'reorder_point')
            ->get();

        $created = 0;

        foreach ($items as $item) {
            // Permanently excluded from Restock Plan — no new alerts / SMS.
            if ($item->restock_excluded) {
                continue;
            }

            $existing = InventoryReorderAlert::query()
                ->where('inventory_item_id', $item->id)
                ->whereNull('resolved_at')
                ->first();

            if ($existing) {
                $existing->update([
                    'current_stock' => $item->current_stock,
                    'reorder_point' => $item->reorder_point,
                ]);

                continue;
            }

            InventoryReorderAlert::create([
                'inventory_item_id' => $item->id,
                'current_stock' => $item->current_stock,
                'reorder_point' => $item->reorder_point,
            ]);
            $created++;
            $this->line("  Alert created: {$item->name} (stock: {$item->current_stock} {$item->unit}, reorder at: {$item->reorder_point})");
        }

        $resolved = 0;
        $openAlerts = InventoryReorderAlert::query()
            ->with('inventoryItem')
            ->whereNull('resolved_at')
            ->get();

        foreach ($openAlerts as $alert) {
            $item = $alert->inventoryItem;
            if (!$item || $item->reorder_point === null || (float) $item->current_stock > (float) $item->reorder_point) {
                $alert->update(['resolved_at' => now()]);
                $resolved++;
            }
        }

        if ($items->isEmpty() && $created === 0) {
            $this->info('All inventory items are above reorder point.');
        } else {
            $this->info("Created {$created} new reorder alert(s). {$items->count()} item(s) at or below reorder point. Resolved {$resolved}.");
        }

        // The digest names every open alert the owner has not heard about
        // yet, or not for a week: a new one, one whose snooze has ended, one
        // still open after seven days (audit, 2026-09-24). Excluded items
        // never have an alert; snoozed ones wait for the snooze to end.
        $due = InventoryReorderAlert::query()
            ->with('inventoryItem')
            ->whereNull('resolved_at')
            ->where(fn ($q) => $q->whereNull('notified_at')->orWhere('notified_at', '<', now()->subDays(self::REMIND_DAYS)))
            ->get()
            ->filter(function (InventoryReorderAlert $alert) use ($today): bool {
                $item = $alert->inventoryItem;
                if (!$item || $item->restock_excluded) {
                    return false;
                }
                $snoozeUntil = $item->restock_snoozed_until;

                return $snoozeUntil === null || $snoozeUntil->copy()->startOfDay()->lt($today);
            })
            ->values();

        if ($due->isNotEmpty() && $this->maybeSendReorderSms($sms, $due->map(fn (InventoryReorderAlert $a) => (string) $a->inventoryItem?->name)->all())) {
            InventoryReorderAlert::query()->whereIn('id', $due->pluck('id'))->update(['notified_at' => now()]);
        }

        if ($created > 0) {
            $this->maybeAutoRestockRequest();
        }

        return self::SUCCESS;
    }

    private function maybeAutoRestockRequest(): void
    {
        if (!filter_var(SiteSetting::get('purchase_requests_auto_on_low_stock', '0'), FILTER_VALIDATE_BOOLEAN)) {
            return;
        }

        $actor = User::query()
            ->where('is_active', true)
            ->whereHas('role', fn ($q) => $q->whereIn('slug', ['owner', 'manager']))
            ->orderBy('id')
            ->first();

        if (!$actor) {
            Log::warning('inventory:check-reorder auto restock PR skipped — no manager/owner user');

            return;
        }

        try {
            $request = Request::create('/api/forecasts/restock/generate-request', 'POST');
            $request->setUserResolver(fn () => $actor);
            $result = app(\App\Domains\Inventory\Services\RestockIntelligenceService::class)
                ->buildRestockRequestDraft($actor, $request, onlyBelowRop: true);

            if ($result['request']) {
                $this->info('Auto restock PR created: ' . $result['request']->request_no);
            }
        } catch (\Throwable $e) {
            Log::warning('inventory:check-reorder auto restock PR failed', ['error' => $e->getMessage()]);
            $this->warn('Auto restock PR failed: ' . $e->getMessage());
        }
    }

    /**
     * @param list<string> $itemNames
     * @return bool true when a text went out (so the alerts can be stamped)
     */
    private function maybeSendReorderSms(SmsService $sms, array $itemNames): bool
    {
        if (!filter_var(SiteSetting::get('ops_inventory_reorder_alert_sms', '0'), FILTER_VALIDATE_BOOLEAN)) {
            return false;
        }

        $count = count($itemNames);
        $preview = collect($itemNames)->take(3)->implode(', ');
        if ($count > 3) {
            $preview .= ' +' . ($count - 3) . ' more';
        }

        $message = "Bake & Grill: {$count} inventory item(s) hit reorder point"
            . ($preview !== '' ? " ({$preview})" : '')
            . '. Check Forecasts → Restock.';

        $phones = OwnerPhones::all();

        if ($phones->isEmpty()) {
            $this->warn('Reorder SMS enabled but no owner/manager phone or business_phone set.');

            return false;
        }

        $dateKey = now()->toDateString();
        foreach ($phones as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: 'system',
                    referenceType: 'inventory_reorder_alert',
                    referenceId: $dateKey,
                    idempotencyKey: 'inventory-reorder-digest:' . $dateKey . ':' . $phone,
                ));
            } catch (\Throwable $e) {
                Log::error('Failed to send inventory reorder SMS', [
                    'phone' => $phone,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $this->info('Reorder alert SMS sent to ' . $phones->count() . ' recipient(s).');

        return true;
    }
}
