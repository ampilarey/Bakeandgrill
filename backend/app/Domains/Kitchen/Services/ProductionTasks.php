<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Services;

use App\Models\Item;
use App\Models\ProductionPlanRecord;
use App\Models\User;
use App\Models\Variant;
use App\Services\KitchenProductionService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The day's plan as a list of jobs for the kitchen.
 *
 * Owner, 2026-09-17: "admin/manager assign and requests items that should
 * be made for tomorrow and assign time and staff to do that, so when he
 * prepares and cashier receives the amount it will be in the prepared list
 * and will be added to the stock."
 *
 * A saved plan line carries who makes it and by when. The cook sees the
 * lines on the KDS, types what they made and sends it to the counter: that
 * is an ordinary prepared-stock batch, pointed back at the plan line, so
 * the counter receives it the way it receives any batch, prepared stock
 * goes up under the item, and the line records made and received.
 */
final class ProductionTasks
{
    public function __construct(private readonly KitchenProductionService $production) {}

    /**
     * Who can be given a task: every active account allowed to make batches.
     *
     * @return list<array{id: int, name: string}>
     */
    public function assignees(): array
    {
        return User::query()
            ->where('is_active', true)
            ->with(['role.permissions', 'permissions'])
            ->orderBy('name')
            ->get()
            ->filter(fn (User $u) => $u->hasPermission('kitchen.production.create'))
            ->map(fn (User $u) => ['id' => (int) $u->id, 'name' => (string) $u->name])
            ->values()
            ->all();
    }

    /**
     * The tasks for one day, earliest due first, with what is done so far.
     *
     * @return array{date: string, tasks: list<array<string, mixed>>}
     */
    public function forDate(string $date): array
    {
        $records = ProductionPlanRecord::query()
            ->where('plan_date', $date)
            ->where('planned_qty', '>', 0)
            ->with(['assignee:id,name', 'maker:id,name'])
            ->get();

        [$items, $variants] = $this->catalogue($records);

        $tasks = $records
            ->map(fn (ProductionPlanRecord $r) => $this->format($r, $items, $variants))
            ->filter()
            ->values()
            ->all();

        usort($tasks, function (array $a, array $b): int {
            $byTime = strcmp($a['due_time'] ?? $a['slot_time'], $b['due_time'] ?? $b['slot_time']);

            return $byTime !== 0 ? $byTime : strcasecmp($a['name'], $b['name']);
        });

        return ['date' => $date, 'tasks' => $tasks];
    }

    /**
     * The cook made some of a task and is sending it to the counter.
     *
     * @return array{task: array<string, mixed>, batch: \App\Models\KitchenProductionBatch}
     */
    public function made(ProductionPlanRecord $record, User $user, float $qty, ?string $notes, ?Request $request = null): array
    {
        if ($qty <= 0) {
            throw ValidationException::withMessages(['qty' => ['Enter how many were made.']]);
        }

        return DB::transaction(function () use ($record, $user, $qty, $notes, $request) {
            $locked = ProductionPlanRecord::query()->whereKey($record->id)->lockForUpdate()->firstOrFail();
            $item = Item::query()->find($locked->item_id);
            if (!$item) {
                throw ValidationException::withMessages(['task' => ['That item is no longer on the menu.']]);
            }
            $variant = $locked->variant_id > 0 ? Variant::query()->find($locked->variant_id) : null;
            $name = $variant ? $item->name . ' — ' . $variant->name : $item->name;

            $batch = $this->production->createBatch($user, [
                'production_type' => 'prepared_stock',
                'source' => 'kds',
                'notes' => sprintf('Plan for %s · %s', $locked->plan_date->toDateString(), $locked->slot_label ?: sprintf('%02d–%02d', $locked->slot_start, $locked->slot_end)),
                'items' => [[
                    'item_id' => (int) $item->id,
                    'variant_id' => $variant?->id,
                    'produced_qty' => $qty,
                    'unit' => 'pcs',
                    'notes' => $notes,
                    'production_plan_record_id' => (int) $locked->id,
                ]],
            ], $request);
            $batch = $this->production->submitBatch($batch, $user, $request);

            $locked->forceFill([
                'made_qty' => (float) $locked->made_qty + $qty,
                'made_by' => $user->id,
                'made_at' => Carbon::now(),
            ])->save();

            $fresh = $locked->fresh(['assignee:id,name', 'maker:id,name']);
            [$items, $variants] = $this->catalogue(new Collection([$fresh]));

            return [
                'task' => $this->format($fresh, $items, $variants) ?? [],
                'batch' => $batch,
                'name' => $name,
            ];
        });
    }

    /**
     * @param Collection<int, Item> $items
     * @param Collection<int, Variant> $variants
     * @return array<string, mixed>|null
     */
    private function format(ProductionPlanRecord $r, Collection $items, Collection $variants): ?array
    {
        $item = $items->get((int) $r->item_id);
        if (!$item) {
            return null;
        }
        $variant = $r->variant_id > 0 ? $variants->get((int) $r->variant_id) : null;
        if ($r->variant_id > 0 && !$variant) {
            return null;
        }

        $planned = (float) $r->planned_qty;
        $made = (float) ($r->made_qty ?? 0.0);
        $received = (float) ($r->received_qty ?? 0.0);
        $remaining = max(0.0, $planned - $made);

        // todo → partial (some made, more to go) → made (all of it sent)
        // → received (the counter has taken in everything that was sent).
        $status = 'todo';
        if ($made > 0) {
            $status = $remaining > 0 ? 'partial' : ($received >= $made ? 'received' : 'made');
        }

        return [
            'id' => (int) $r->id,
            'item_id' => (int) $r->item_id,
            'variant_id' => (int) $r->variant_id,
            'name' => $variant ? $item->name . ' — ' . $variant->name : $item->name,
            'slot_label' => $r->slot_label ?: sprintf('%02d–%02d', $r->slot_start, $r->slot_end),
            'slot_start' => (int) $r->slot_start,
            'slot_end' => (int) $r->slot_end,
            'slot_time' => sprintf('%02d:00', $r->slot_start),
            'planned_qty' => round($planned, 1),
            'made_qty' => round($made, 1),
            'received_qty' => round($received, 1),
            'remaining' => round($remaining, 1),
            'assigned_to' => $r->assigned_to !== null ? (int) $r->assigned_to : null,
            'assigned_name' => $r->assignee?->name,
            'due_time' => $r->due_time,
            'made_at' => $r->made_at?->toIso8601String(),
            'made_by_name' => $r->maker?->name,
            'status' => $status,
            // The recipe's method, for the cook making it.
            'instructions' => trim((string) ($item->recipe?->instructions ?? '')) ?: null,
        ];
    }

    /**
     * @param Collection<int, ProductionPlanRecord> $records
     * @return array{0: Collection<int, Item>, 1: Collection<int, Variant>}
     */
    private function catalogue(Collection $records): array
    {
        $itemIds = $records->pluck('item_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
        $variantIds = $records->pluck('variant_id')->map(fn ($id) => (int) $id)->filter(fn (int $id) => $id > 0)->unique()->values()->all();

        $items = $itemIds === []
            ? new Collection
            : Item::query()->whereIn('id', $itemIds)->with('recipe:id,item_id,instructions')->get()->keyBy('id');
        $variants = $variantIds === [] ? new Collection : Variant::query()->whereIn('id', $variantIds)->get()->keyBy('id');

        return [$items, $variants];
    }
}
