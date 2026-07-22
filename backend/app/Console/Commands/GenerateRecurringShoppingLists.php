<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\RecurringShoppingList;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\PurchaseRequestService;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GenerateRecurringShoppingLists extends Command
{
    protected $signature = 'purchase-requests:generate-recurring-lists {--dry-run : Preview without saving}';

    protected $description = 'Create purchase requests from due recurring shopping lists';

    public function handle(PurchaseRequestService $requests): int
    {
        if (!filter_var(SiteSetting::get('purchase_requests_recurring_lists_enabled', '0'), FILTER_VALIDATE_BOOLEAN)) {
            $this->info('Recurring shopping lists are disabled (purchase_requests_recurring_lists_enabled=0).');

            return self::SUCCESS;
        }

        $today = now()->toDateString();
        $ids = RecurringShoppingList::query()
            ->where('is_active', true)
            ->whereNotNull('next_run_date')
            ->whereDate('next_run_date', '<=', $today)
            ->pluck('id');

        if ($ids->isEmpty()) {
            $this->info('No recurring shopping lists due today.');

            return self::SUCCESS;
        }

        $actor = User::query()
            ->where('is_active', true)
            ->whereHas('role', fn ($q) => $q->whereIn('slug', ['owner', 'manager']))
            ->orderBy('id')
            ->first();

        if (!$actor) {
            $this->error('No manager/owner user to attribute generated requests.');

            return self::FAILURE;
        }

        $created = 0;
        foreach ($ids as $listId) {
            DB::transaction(function () use ($listId, $today, $actor, $requests, &$created): void {
                $list = RecurringShoppingList::query()->with('items')->lockForUpdate()->find($listId);
                if (!$list || !$list->is_active) {
                    return;
                }
                if ($list->next_run_date === null || $list->next_run_date->toDateString() > $today) {
                    return;
                }

                $lines = [];
                foreach ($list->items as $item) {
                    if (!$item->inventory_item_id && !$item->free_text_name) {
                        continue;
                    }
                    $lines[] = [
                        'inventory_item_id' => $item->inventory_item_id,
                        'free_text_name' => $item->free_text_name,
                        'requested_qty' => (float) $item->qty,
                        'requested_unit' => $item->unit ?: 'pcs',
                        'estimated_unit_cost_laar' => $item->estimated_unit_cost_laar,
                        'reason' => 'other',
                        'notes' => 'Recurring list: ' . $list->name,
                    ];
                }

                $this->line("  → {$list->name} (" . count($lines) . ' lines)');

                if ($this->option('dry-run') || $lines === []) {
                    $list->next_run_date = $this->nextDate($list->next_run_date->toDateString(), $list->recurrence_interval);
                    if (!$this->option('dry-run') && $lines === []) {
                        $list->save();
                    }

                    return;
                }

                $http = Request::create('/api/purchase-requests', 'POST');
                $http->setUserResolver(fn () => $actor);
                $pr = $requests->create($actor, [
                    'title' => $list->title_template ?: ('Shopping list: ' . $list->name),
                    'source' => 'recurring_list',
                    'priority' => $list->priority ?: 'normal',
                    'notes' => 'Auto-generated from recurring shopping list #' . $list->id,
                ], $lines, $http);

                $list->next_run_date = $this->nextDate($list->next_run_date->toDateString(), $list->recurrence_interval);
                $list->save();
                $created++;
                $this->line("    Created {$pr->request_no}, next due: {$list->next_run_date->toDateString()}");
            });
        }

        $this->info($this->option('dry-run') ? 'Dry run complete.' : "Created {$created} purchase request(s).");

        return self::SUCCESS;
    }

    private function nextDate(string $from, string $interval): string
    {
        $date = \Carbon\Carbon::parse($from);

        return match ($interval) {
            'daily' => $date->addDay()->toDateString(),
            'monthly' => $date->addMonth()->toDateString(),
            'quarterly' => $date->addMonths(3)->toDateString(),
            'yearly' => $date->addYear()->toDateString(),
            default => $date->addWeek()->toDateString(),
        };
    }
}
