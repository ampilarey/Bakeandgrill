<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Models\Variant;
use App\Rules\UniqueScanCode;
use Illuminate\Contracts\Validation\Validator;

/**
 * SKU and barcode rules for the item editor, on the dish and on every size.
 *
 * Sizes had no rules at all here. `variants.*.barcode` was missing from the
 * list, so `validated()` dropped it and VariantSyncService wrote null over
 * whatever was there — set a size's barcode through the variants API, then
 * save the dish in the editor, and the barcode was gone with nothing said.
 * `variants.*.sku` was listed but unconstrained, while the column carries a
 * unique index, so a repeated SKU came back as a 500 from the driver instead
 * of a message naming the clash.
 *
 * @see UniqueScanCode for why one code may not appear in two of the four columns.
 */
trait ValidatesScanCodes
{
    /**
     * @return array<string, mixed>
     */
    protected function scanCodeRules(int|string|null $itemId = null): array
    {
        $item = $itemId ? \App\Models\Item::withTrashed()->find($itemId) : null;

        return [
            'sku' => [
                'nullable', 'string', 'max:100',
                new UniqueScanCode('items', $itemId, $item?->sku),
            ],
            'barcode' => [
                'nullable', 'string', 'max:100',
                new UniqueScanCode('items', $itemId, $item?->barcode),
            ],
            'variants.*.sku' => 'nullable|string|max:100',
            'variants.*.barcode' => 'nullable|string|max:100',
        ];
    }

    /**
     * Uniqueness for the sizes, plus collisions inside the payload itself.
     *
     * A size's own id sits beside its code in the payload rather than in the
     * route, so the check has to be built per row. Doing that as a wildcard
     * rule means nesting a rule object inside Rule::forEach inside a rule
     * array, which Laravel unpacks by string — so it runs here instead, where
     * the index, the id and the value are all in hand.
     *
     * The same pass catches two rows given one code in a single save. Neither
     * the database nor UniqueScanCode can see that: the rows are not written
     * yet, so there is nothing to collide with until the transaction has
     * already accepted both.
     */
    protected function validateScanCodesWithinPayload(Validator $validator): void
    {
        $rows = $this->input('variants');
        if (!is_array($rows)) {
            return;
        }

        $seen = [];
        foreach ($rows as $index => $row) {
            if (!is_array($row)) {
                continue;
            }

            $id = $row['id'] ?? null;

            foreach (['sku', 'barcode'] as $column) {
                $code = is_scalar($row[$column] ?? null) ? trim((string) $row[$column]) : '';
                if ($code === '') {
                    continue;
                }

                if (isset($seen[$code])) {
                    $validator->errors()->add(
                        "variants.{$index}.{$column}",
                        "\"{$code}\" is already used by another size on this dish.",
                    );

                    continue;
                }

                $seen[$code] = true;

                $current = $id ? Variant::find($id)?->{$column} : null;
                (new UniqueScanCode('variants', $id, $current))->validate(
                    "variants.{$index}.{$column}",
                    $code,
                    function (string $message) use ($validator, $index, $column) {
                        $validator->errors()->add("variants.{$index}.{$column}", $message);
                    },
                );
            }
        }

        // The dish's own codes share the namespace with its sizes.
        foreach (['sku', 'barcode'] as $column) {
            $code = is_scalar($this->input($column)) ? trim((string) $this->input($column)) : '';
            if ($code !== '' && isset($seen[$code])) {
                $validator->errors()->add(
                    $column,
                    "\"{$code}\" is already used by one of this dish's sizes.",
                );
            }
        }
    }
}
