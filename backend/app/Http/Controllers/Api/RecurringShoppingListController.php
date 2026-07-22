<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RecurringShoppingList;
use App\Models\RecurringShoppingListItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RecurringShoppingListController extends Controller
{
    public function index(): JsonResponse
    {
        $lists = RecurringShoppingList::query()->with('items.inventoryItem:id,name,unit')->orderBy('name')->get();

        return response()->json(['lists' => $lists->map(fn ($l) => $this->format($l))]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateList($request);
        $list = DB::transaction(function () use ($validated) {
            $list = RecurringShoppingList::create([
                'name' => $validated['name'],
                'is_active' => $validated['is_active'] ?? true,
                'recurrence_interval' => $validated['recurrence_interval'] ?? 'weekly',
                'next_run_date' => $validated['next_run_date'] ?? now()->toDateString(),
                'priority' => $validated['priority'] ?? 'normal',
                'title_template' => $validated['title_template'] ?? null,
            ]);
            $this->syncItems($list, $validated['items'] ?? []);

            return $list->fresh('items.inventoryItem');
        });

        return response()->json(['list' => $this->format($list)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $list = RecurringShoppingList::findOrFail($id);
        $validated = $this->validateList($request, partial: true);
        $list = DB::transaction(function () use ($list, $validated) {
            $list->update(array_filter([
                'name' => $validated['name'] ?? null,
                'is_active' => array_key_exists('is_active', $validated) ? $validated['is_active'] : null,
                'recurrence_interval' => $validated['recurrence_interval'] ?? null,
                'next_run_date' => $validated['next_run_date'] ?? null,
                'priority' => $validated['priority'] ?? null,
                'title_template' => array_key_exists('title_template', $validated) ? $validated['title_template'] : null,
            ], fn ($v) => $v !== null));

            if (array_key_exists('items', $validated)) {
                $list->items()->delete();
                $this->syncItems($list, $validated['items'] ?? []);
            }

            return $list->fresh('items.inventoryItem');
        });

        return response()->json(['list' => $this->format($list)]);
    }

    public function destroy(int $id): JsonResponse
    {
        RecurringShoppingList::findOrFail($id)->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    /** @return array<string, mixed> */
    private function validateList(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        $validated = $request->validate([
            'name' => [$req, 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'recurrence_interval' => ['sometimes', 'in:daily,weekly,monthly,quarterly,yearly'],
            'next_run_date' => ['nullable', 'date'],
            'priority' => ['sometimes', 'in:low,normal,urgent'],
            'title_template' => ['nullable', 'string', 'max:255'],
            'items' => [$partial ? 'sometimes' : 'required', 'array', 'min:1'],
            'items.*.inventory_item_id' => ['nullable', 'integer', 'exists:inventory_items,id'],
            'items.*.free_text_name' => ['nullable', 'string', 'max:255'],
            'items.*.qty' => ['required_with:items', 'numeric', 'min:0.001'],
            'items.*.unit' => ['nullable', 'string', 'max:32'],
            'items.*.estimated_unit_cost_laar' => ['nullable', 'integer', 'min:0'],
            'items.*.sort' => ['nullable', 'integer', 'min:0'],
        ]);

        foreach ($validated['items'] ?? [] as $line) {
            if (empty($line['inventory_item_id']) && empty($line['free_text_name'])) {
                throw ValidationException::withMessages(['items' => ['Each line needs inventory_item_id or free_text_name.']]);
            }
        }

        return $validated;
    }

    /** @param list<array<string, mixed>> $items */
    private function syncItems(RecurringShoppingList $list, array $items): void
    {
        foreach (array_values($items) as $i => $line) {
            RecurringShoppingListItem::create([
                'recurring_shopping_list_id' => $list->id,
                'inventory_item_id' => $line['inventory_item_id'] ?? null,
                'free_text_name' => $line['free_text_name'] ?? null,
                'qty' => $line['qty'],
                'unit' => $line['unit'] ?? 'pcs',
                'estimated_unit_cost_laar' => $line['estimated_unit_cost_laar'] ?? null,
                'sort' => $line['sort'] ?? $i,
            ]);
        }
    }

    private function format(RecurringShoppingList $list): array
    {
        return [
            'id' => $list->id,
            'name' => $list->name,
            'is_active' => $list->is_active,
            'recurrence_interval' => $list->recurrence_interval,
            'next_run_date' => $list->next_run_date?->toDateString(),
            'priority' => $list->priority,
            'title_template' => $list->title_template,
            'items' => $list->items->map(fn (RecurringShoppingListItem $i) => [
                'id' => $i->id,
                'inventory_item_id' => $i->inventory_item_id,
                'inventory_item_name' => $i->inventoryItem?->name,
                'free_text_name' => $i->free_text_name,
                'qty' => (float) $i->qty,
                'unit' => $i->unit,
                'estimated_unit_cost_laar' => $i->estimated_unit_cost_laar,
                'sort' => $i->sort,
            ])->values()->all(),
        ];
    }
}
