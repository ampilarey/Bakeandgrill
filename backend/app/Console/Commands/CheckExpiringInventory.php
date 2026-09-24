<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\InventoryItem;
use App\Models\SiteSetting;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Lists stock expiring soon and, under the same "stock alert SMS" switch
 * as the reorder digest, texts the owners once a day about it (audit,
 * 2026-09-24: before, the list went to a console nobody reads).
 */
class CheckExpiringInventory extends Command
{
    protected $signature = 'inventory:check-expiry {--days=7 : Warn if expiry within this many days}';

    protected $description = 'List inventory items expiring within N days and text the owners about them';

    public function handle(SmsService $sms): int
    {
        $days = (int) $this->option('days');
        $threshold = now()->addDays($days)->toDateString();

        $expiring = InventoryItem::where('is_active', true)
            ->whereNotNull('expiry_date')
            ->where('expiry_date', '<=', $threshold)
            ->where('current_stock', '>', 0)
            ->orderBy('expiry_date')
            ->get();

        if ($expiring->isEmpty()) {
            $this->info("No items expiring within {$days} days.");

            return 0;
        }

        $this->warn("Items expiring within {$days} days:");
        $this->table(
            ['ID', 'Name', 'Stock', 'Unit', 'Expiry Date', 'Days Left'],
            $expiring->map(fn ($i) => [
                $i->id,
                $i->name,
                number_format((float) $i->current_stock, 2),
                $i->unit ?? '-',
                $i->expiry_date->toDateString(),
                (int) floor(now()->startOfDay()->diffInDays($i->expiry_date, false)),
            ]),
        );

        $this->maybeSendExpirySms($sms, $expiring, $days);

        return 0;
    }

    /** @param \Illuminate\Support\Collection<int, InventoryItem> $expiring */
    private function maybeSendExpirySms(SmsService $sms, $expiring, int $days): void
    {
        if (!filter_var(SiteSetting::get('ops_inventory_reorder_alert_sms', '0'), FILTER_VALIDATE_BOOLEAN)) {
            return;
        }

        $phones = OwnerPhones::all();
        if ($phones->isEmpty()) {
            $this->warn('Stock alert SMS enabled but no owner/manager phone or business_phone set.');

            return;
        }

        $today = now()->startOfDay();
        $names = $expiring->map(function (InventoryItem $i) use ($today): string {
            $left = (int) floor($today->diffInDays($i->expiry_date, false));

            return $i->name . ' (' . ($left < 0 ? 'expired' : ($left === 0 ? 'today' : $left . 'd')) . ')';
        });
        $count = $names->count();
        $preview = $names->take(3)->implode(', ') . ($count > 3 ? ' +' . ($count - 3) . ' more' : '');
        $message = "Bake & Grill: {$count} inventory item(s) expire within {$days} days: {$preview}. Use or write off — check Inventory.";

        $dateKey = now()->toDateString();
        foreach ($phones as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: 'system',
                    referenceType: 'inventory_expiry_alert',
                    referenceId: $dateKey,
                    idempotencyKey: 'inventory-expiry-digest:' . $dateKey . ':' . $phone,
                ));
            } catch (\Throwable $e) {
                Log::error('Failed to send inventory expiry SMS', ['phone' => $phone, 'error' => $e->getMessage()]);
            }
        }

        $this->info('Expiry alert SMS sent to ' . $phones->count() . ' recipient(s).');
    }
}
