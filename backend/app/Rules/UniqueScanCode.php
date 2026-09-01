<?php

declare(strict_types=1);

namespace App\Rules;

use App\Models\Item;
use App\Models\Variant;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A code a scanner can read must identify exactly one thing to sell.
 *
 * The database gets us most of the way — items.sku, items.barcode and
 * variants.sku each carry a unique index — but they are four separate columns
 * across two tables, and the scan endpoint searches all four. So "unique in
 * its own column" is not the same question as "unambiguous at the till":
 * item A's SKU and item B's barcode can both be 5012345, both indexes stay
 * happy, and the scan silently picks whichever the query reached first.
 *
 * This rule asks the question that matters instead: is any *other* row already
 * using this code, in any of the four columns?
 *
 * `$currentValue` is the value already stored on the row being edited. When the
 * submitted value matches it, the rule passes without looking — otherwise a
 * collision that predates this rule would block every future edit of a row that
 * is not even changing its code, which turns old bad data into a wall in front
 * of unrelated work. New collisions are refused; existing ones are left for the
 * owner to clear deliberately.
 */
class UniqueScanCode implements ValidationRule
{
    /**
     * @param 'items'|'variants'|null $ownerTable Row being edited, so it does not collide with itself.
     */
    public function __construct(
        private readonly ?string $ownerTable = null,
        private readonly int|string|null $ownerId = null,
        private readonly ?string $currentValue = null,
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null || $value === '' || !is_scalar($value)) {
            return;
        }

        $code = trim((string) $value);
        if ($code === '' || $code === trim((string) $this->currentValue)) {
            return;
        }

        $ownerId = $this->ownerId === null ? null : (int) $this->ownerId;

        $item = Item::withTrashed()
            ->where(fn ($q) => $q->where('sku', $code)->orWhere('barcode', $code))
            ->when(
                $this->ownerTable === 'items' && $ownerId,
                fn ($q) => $q->where('id', '!=', $ownerId),
            )
            ->first(['id', 'name']);

        if ($item) {
            $fail("This code is already used by the dish \"{$item->name}\".");

            return;
        }

        $variant = Variant::query()
            ->with(['item' => fn ($q) => $q->withTrashed()->select('id', 'name')])
            ->where(fn ($q) => $q->where('sku', $code)->orWhere('barcode', $code))
            ->when(
                $this->ownerTable === 'variants' && $ownerId,
                fn ($q) => $q->where('id', '!=', $ownerId),
            )
            ->first();

        if ($variant) {
            $dish = $variant->item?->name ?? 'another dish';
            $fail("This code is already used by \"{$variant->name}\" on \"{$dish}\".");
        }
    }
}
