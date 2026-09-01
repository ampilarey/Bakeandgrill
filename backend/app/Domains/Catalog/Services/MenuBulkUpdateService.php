<?php

declare(strict_types=1);

namespace App\Domains\Catalog\Services;

use App\Domains\Gst\Services\GstItemTaxNormalizer;
use App\Models\Item;
use App\Models\Variant;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * Applies one small change to each of many items at once.
 *
 * Owner, 2026-09-01: wanted the menu editable "like an excel sheet" — fix
 * twelve prices without opening twelve dialogs — plus one change applied to a
 * whole selection.
 *
 * This deliberately does NOT reuse ItemController::update(). That endpoint
 * takes a whole item: it replaces the variant list wholesale through
 * VariantSyncService, syncs or clears combo and platter composition, and runs
 * image-file cleanup. Sending it a partial row would wipe the parts left out,
 * and looping it over forty rows would run all of that forty times. So the
 * bulk path is sparse and narrow instead:
 *
 *  - only the scalar columns in FIELDS can be touched; variants, photos,
 *    combos, platters, channel availability and images are not reachable from
 *    here at all and stay with the full editor;
 *  - only the keys actually sent are written, so two people editing different
 *    columns of one item do not overwrite each other;
 *  - every row is validated before any row is written, and the write is one
 *    transaction — a bulk price change either lands completely or not at all.
 *    A half-applied repricing is worse than a rejected one.
 */
class MenuBulkUpdateService
{
    /** Hard ceiling per call — keeps one request from rewriting the menu. */
    public const MAX_ROWS = 500;

    /**
     * Columns a bulk edit may write, with their validation rules.
     *
     * `:id` is replaced with the row's own id so unique rules ignore the row
     * being edited. Anything absent from this list is silently unreachable —
     * see the class docblock for why the list is short.
     *
     * @return array<string, string>
     */
    public static function fieldRules(): array
    {
        return [
            'name' => 'string|max:255',
            'name_dv' => 'nullable|string|max:255',
            'sku' => 'nullable|string|max:100|unique:items,sku,:id',
            'barcode' => 'nullable|string|max:100|unique:items,barcode,:id',
            'base_price' => 'numeric|min:0|max:1000000',
            'cost' => 'nullable|numeric|min:0|max:1000000',
            'category_id' => 'nullable|integer|exists:categories,id',
            'menu_group_id' => 'nullable|integer|exists:menu_groups,id',
            'sort_order' => 'nullable|integer|min:0|max:100000',
            'tax_code' => 'string|in:standard_8,zero_rated,exempt,out_of_scope',
            'is_active' => 'boolean',
            'is_available' => 'boolean',
            'track_stock' => 'boolean',
            'stock_quantity' => 'nullable|integer|min:0',
            'low_stock_threshold' => 'nullable|integer|min:0',
            'prep_time_minutes' => 'nullable|integer|min:0|max:480',
            'packaging_fee' => 'numeric|min:0|max:500',
            'allow_pre_order' => 'boolean',
            'show_on_signage' => 'boolean',
        ];
    }

    /**
     * Columns a bulk edit may write on an existing variant.
     *
     * Sizes are where the repetitive work actually is — a price rise means
     * touching Full and Half, not one base price — so they are editable here
     * too. What is NOT reachable is the variant *list*: adding, removing or
     * reordering sizes stays in the item editor, because those are decisions
     * about an item's shape rather than a value on a row, and expressing them
     * sparsely would mean guessing at what a missing row meant.
     *
     * @return array<string, string>
     */
    public static function variantFieldRules(): array
    {
        return [
            'name' => 'string|max:100',
            'name_dv' => 'nullable|string|max:100',
            'price' => 'numeric|min:0|max:1000000',
            'cost' => 'nullable|numeric|min:0|max:1000000',
            'sku' => 'nullable|string|max:100|unique:variants,sku,:id',
            'track_stock' => 'boolean',
            'stock_qty' => 'nullable|integer|min:0',
            'low_stock_threshold' => 'nullable|integer|min:0',
            'consumption_factor' => 'numeric|min:0|max:1000',
            'is_active' => 'boolean',
            'sort_order' => 'nullable|integer|min:0|max:100000',
        ];
    }

    /**
     * Cost price is owner-only everywhere else (recipes.manage gates the
     * margin badge and the recipe editor); the bulk path must not be a way
     * around that.
     *
     * @return list<string>
     */
    public static function costFields(): array
    {
        return ['cost'];
    }

    public function __construct(
        private readonly GstItemTaxNormalizer $taxNormalizer,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param list<array{id: int, fields: array<string, mixed>}> $changes
     * @return array<int, array<string, list<string>>> row index → field → messages
     */
    public function validate(array $changes, bool $canSeeCost): array
    {
        return $this->validateRows($changes, self::fieldRules(), $canSeeCost, ['sku', 'barcode']);
    }

    /**
     * @param list<array{id: int, fields: array<string, mixed>}> $changes
     * @return array<int, array<string, list<string>>> row index → field → messages
     */
    public function validateVariants(array $changes, bool $canSeeCost): array
    {
        return $this->validateRows($changes, self::variantFieldRules(), $canSeeCost, ['sku']);
    }

    /**
     * @param list<array{id: int, fields: array<string, mixed>}> $changes
     * @param array<string, string> $allowed
     * @param list<string> $uniqueFields
     * @return array<int, array<string, list<string>>>
     */
    private function validateRows(array $changes, array $allowed, bool $canSeeCost, array $uniqueFields): array
    {
        $errors = [];

        foreach ($changes as $index => $change) {
            $fields = $change['fields'];
            $rowErrors = [];

            foreach (array_keys($fields) as $field) {
                if (!array_key_exists($field, $allowed)) {
                    $rowErrors[$field] = ['This field cannot be changed from the bulk editor.'];
                } elseif (!$canSeeCost && in_array($field, self::costFields(), true)) {
                    $rowErrors[$field] = ['Only an owner may change cost price.'];
                }
            }

            $rules = [];
            foreach ($fields as $field => $_) {
                if (isset($allowed[$field]) && !isset($rowErrors[$field])) {
                    $rules[$field] = str_replace(':id', (string) $change['id'], $allowed[$field]);
                }
            }

            if ($rules !== []) {
                $validator = Validator::make($fields, $rules);
                if ($validator->fails()) {
                    $rowErrors += $validator->errors()->toArray();
                }
            }

            if ($rowErrors !== []) {
                $errors[$index] = $rowErrors;
            }
        }

        return $errors + $this->duplicateErrors($changes, $uniqueFields);
    }

    /**
     * Two rows in one batch can each pass `unique:items,sku` — neither clashes
     * with what is stored yet — and then collide with each other on save. The
     * database would reject the second write and roll the whole batch back
     * with an opaque error, so catch it here and name both rows.
     *
     * @param list<array{id: int, fields: array<string, mixed>}> $changes
     * @param list<string> $fields
     * @return array<int, array<string, list<string>>>
     */
    private function duplicateErrors(array $changes, array $fields): array
    {
        $errors = [];

        foreach ($fields as $field) {
            $seen = [];
            foreach ($changes as $index => $change) {
                $value = $change['fields'][$field] ?? null;
                if (!is_string($value) || trim($value) === '') {
                    continue;
                }
                $key = mb_strtolower(trim($value));
                if (isset($seen[$key])) {
                    $message = 'Two rows in this save use the same ' . $field . ' (' . trim($value) . ').';
                    $errors[$seen[$key]][$field] = [$message];
                    $errors[$index][$field] = [$message];

                    continue;
                }
                $seen[$key] = $index;
            }
        }

        return $errors;
    }

    /**
     * Write every change in one transaction and report what actually moved.
     *
     * Items and their sizes go together: raising a dish's price usually means
     * moving Full and Half too, and splitting that across two requests would
     * let one half land while the other failed.
     *
     * @param list<array{id: int, fields: array<string, mixed>}> $changes
     * @param list<array{id: int, fields: array<string, mixed>}> $variantChanges
     * @return array{updated: int, unchanged: int, items: list<Item>}
     */
    public function apply(array $changes, array $variantChanges = [], ?Request $request = null): array
    {
        return DB::transaction(function () use ($changes, $variantChanges, $request) {
            $ids = array_map(static fn (array $c) => $c['id'], $changes);
            // Locked up-front so a concurrent single-item save cannot land
            // between our read of the old values and our write of the new.
            $items = Item::query()->whereIn('id', $ids)->lockForUpdate()->get()->keyBy('id');

            $touched = [];
            $unchanged = 0;

            foreach ($changes as $change) {
                $item = $items->get($change['id']);
                if (!$item) {
                    continue;
                }

                $fields = $this->derive($change['fields'], $item);
                $before = [];
                $after = [];

                foreach ($fields as $field => $value) {
                    $current = $item->getAttribute($field);
                    // Compare loosely: a price arrives as "12.50" from a text
                    // input but reads back as a decimal cast, and re-saving an
                    // untouched cell should not count as a change.
                    if ($this->same($current, $value)) {
                        continue;
                    }
                    $before[$field] = $current;
                    $after[$field] = $value;
                    $item->setAttribute($field, $value);
                }

                if ($after === []) {
                    $unchanged++;

                    continue;
                }

                $item->save();
                $touched[] = ['id' => $item->id, 'name' => $item->name, 'old' => $before, 'new' => $after];
            }

            $variantIds = array_map(static fn (array $c) => $c['id'], $variantChanges);
            $variants = $variantIds === []
                ? collect()
                : Variant::query()->whereIn('id', $variantIds)->lockForUpdate()->get()->keyBy('id');
            $touchedVariants = [];

            foreach ($variantChanges as $change) {
                $variant = $variants->get($change['id']);
                if (!$variant) {
                    continue;
                }

                $before = [];
                $after = [];
                foreach ($change['fields'] as $field => $value) {
                    $current = $variant->getAttribute($field);
                    if ($this->same($current, $value)) {
                        continue;
                    }
                    $before[$field] = $current;
                    $after[$field] = $value;
                    $variant->setAttribute($field, $value);
                }

                if ($after === []) {
                    $unchanged++;

                    continue;
                }

                $variant->save();
                $touchedVariants[] = [
                    'id' => $variant->id,
                    'item_id' => $variant->item_id,
                    'name' => $variant->name,
                    'old' => $before,
                    'new' => $after,
                ];
                if (!in_array((int) $variant->item_id, $ids, true)) {
                    // So the response still carries the item whose size moved.
                    $ids[] = (int) $variant->item_id;
                }
            }

            if ($touched !== [] || $touchedVariants !== []) {
                // Item edits are not otherwise audited. A bulk change is the
                // one that is hard to reconstruct afterwards ("who put every
                // burger up 10%?"), so record the before and after per row.
                $this->audit->log(
                    action: 'menu.bulk_update',
                    modelType: Item::class,
                    modelId: null,
                    oldValues: [
                        'items' => array_column($touched, 'old', 'id'),
                        'variants' => array_column($touchedVariants, 'old', 'id'),
                    ],
                    newValues: [
                        'items' => array_column($touched, 'new', 'id'),
                        'variants' => array_column($touchedVariants, 'new', 'id'),
                    ],
                    meta: [
                        'item_count' => count($touched),
                        'variant_count' => count($touchedVariants),
                        'items' => array_map(
                            static fn (array $r) => ['id' => $r['id'], 'name' => $r['name']],
                            $touched,
                        ),
                        'variants' => array_map(
                            static fn (array $r) => [
                                'id' => $r['id'],
                                'item_id' => $r['item_id'],
                                'name' => $r['name'],
                            ],
                            $touchedVariants,
                        ),
                    ],
                    request: $request,
                );
            }

            return [
                'updated' => count($touched) + count($touchedVariants),
                'unchanged' => $unchanged,
                'items' => Item::query()
                    ->with(['category', 'variants', 'menuGroup', 'channelAvailabilities'])
                    ->whereIn('id', $ids)
                    ->get()
                    ->all(),
            ];
        });
    }

    /**
     * Columns the caller did not send but that must move with one it did.
     *
     * @param array<string, mixed> $fields
     * @return array<string, mixed>
     */
    private function derive(array $fields, Item $item): array
    {
        // tax_rate is derived from tax_code, never sent directly — otherwise
        // an item could be marked exempt while still carrying 8%.
        if (array_key_exists('tax_code', $fields)) {
            $fields = $this->taxNormalizer->normalize($fields);
        }

        // The single-item editor pairs these two (menuItemForm.ts): stock is
        // only enforced when availability_type is stock_based, so turning
        // tracking on without it would silently do nothing.
        if (array_key_exists('track_stock', $fields)) {
            $tracking = (bool) $fields['track_stock'];
            if ($tracking && $item->availability_type !== 'stock_based') {
                $fields['availability_type'] = 'stock_based';
            } elseif (!$tracking && $item->availability_type === 'stock_based') {
                $fields['availability_type'] = 'made_to_order';
            }
        }

        return $fields;
    }

    private function same(mixed $current, mixed $value): bool
    {
        if (is_bool($value) || is_bool($current)) {
            return (bool) $current === (bool) $value;
        }
        if (is_numeric($current) && is_numeric($value)) {
            return abs((float) $current - (float) $value) < 0.0001;
        }
        if ($current === null || $value === null) {
            return $current === $value;
        }

        return (string) $current === (string) $value;
    }
}
