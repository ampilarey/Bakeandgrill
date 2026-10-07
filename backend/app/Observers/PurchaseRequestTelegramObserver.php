<?php

declare(strict_types=1);

namespace App\Observers;

use App\Domains\Telegram\Services\TelegramBuyingList;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The buying list on Telegram follows the request (2026-10-07): a new
 * request goes to the approvers once its lines are saved, and any change of
 * status, buyer or item redraws the cards already sent. All after the
 * response; nothing here can fail the request itself.
 */
class PurchaseRequestTelegramObserver
{
    public function created(PurchaseRequest $request): void
    {
        $id = (int) $request->id;
        // Its lines are added in the same transaction: wait for the commit.
        DB::afterCommit(static fn () => DeferAfterResponse::run(static function () use ($id): void {
            try {
                app(TelegramBuyingList::class)->created($id);
            } catch (Throwable $e) {
                Log::warning('telegram buying list: new request not sent', ['request_id' => $id, 'error' => $e->getMessage()]);
            }
        }, 'telegram-buying-list-new'));
    }

    public function updated(PurchaseRequest $request): void
    {
        if (!$request->wasChanged('status') && !$request->wasChanged('assigned_to')) {
            return;
        }
        $assignee = $request->getOriginal('assigned_to');
        TelegramBuyingList::queue((int) $request->id, (string) $request->getOriginal('status'), $assignee !== null ? (int) $assignee : null);
    }

    public function itemUpdated(PurchaseRequestItem $item): void
    {
        if ($item->wasChanged('status') || $item->wasChanged('actual_total_laar')) {
            TelegramBuyingList::queue((int) $item->purchase_request_id, null, null, changed: false);
        }
    }
}
