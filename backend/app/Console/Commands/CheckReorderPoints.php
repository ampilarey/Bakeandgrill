<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\InventoryItem;
use App\Models\InventoryReorderAlert;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class CheckReorderPoints extends Command
{
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
        /** @var list<string> $notifyNames */
        $notifyNames = [];

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

            $snoozeUntil = $item->restock_snoozed_until;
            $isSnoozed = $snoozeUntil !== null && $snoozeUntil->copy()->startOfDay()->gte($today);
            if (! $isSnoozed) {
                $notifyNames[] = (string) $item->name;
            }
        }

        $resolved = 0;
        $openAlerts = InventoryReorderAlert::query()
            ->with('inventoryItem')
            ->whereNull('resolved_at')
            ->get();

        foreach ($openAlerts as $alert) {
            $item = $alert->inventoryItem;
            if (! $item || $item->reorder_point === null || (float) $item->current_stock > (float) $item->reorder_point) {
                $alert->update(['resolved_at' => now()]);
                $resolved++;
            }
        }

        if ($items->isEmpty() && $created === 0) {
            $this->info('All inventory items are above reorder point.');
        } else {
            $this->info("Created {$created} new reorder alert(s). {$items->count()} item(s) at or below reorder point. Resolved {$resolved}.");
        }

        if ($notifyNames !== []) {
            $this->maybeSendReorderSms($sms, $notifyNames);
        }

        return self::SUCCESS;
    }

    /**
     * @param  list<string>  $itemNames
     */
    private function maybeSendReorderSms(SmsService $sms, array $itemNames): void
    {
        if (! filter_var(SiteSetting::get('ops_inventory_reorder_alert_sms', '0'), FILTER_VALIDATE_BOOLEAN)) {
            return;
        }

        $count = count($itemNames);
        $preview = collect($itemNames)->take(3)->implode(', ');
        if ($count > 3) {
            $preview .= ' +'.($count - 3).' more';
        }

        $message = "Bake & Grill: {$count} inventory item(s) hit reorder point"
            .($preview !== '' ? " ({$preview})" : '')
            .'. Check Forecasts → Restock.';

        $phones = User::query()
            ->where('is_active', true)
            ->whereHas('role', fn ($q) => $q->whereIn('slug', ['owner', 'manager']))
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->pluck('phone')
            ->map(fn ($p) => trim((string) $p))
            ->filter()
            ->unique()
            ->values();

        if ($phones->isEmpty()) {
            $fallback = trim((string) SiteSetting::get('business_phone', ''));
            if ($fallback !== '') {
                $phones = collect([$fallback]);
            }
        }

        if ($phones->isEmpty()) {
            $this->warn('Reorder SMS enabled but no owner/manager phone or business_phone set.');

            return;
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
                    idempotencyKey: 'inventory-reorder-digest:'.$dateKey.':'.$phone,
                ));
            } catch (\Throwable $e) {
                Log::error('Failed to send inventory reorder SMS', [
                    'phone' => $phone,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $this->info('Reorder alert SMS sent to '.$phones->count().' recipient(s).');
    }
}
