<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Item;
use App\Models\OrderItem;
use App\Models\Variant;
use Illuminate\Console\Command;

/**
 * Sizes that look like they were meant to be gone.
 *
 * Until 2026-09-01 the item editor's remove button only dropped the row from
 * the form — nothing deleted it — so a size taken off the menu months ago kept
 * selling on the POS, the website and the app. That is fixed going forward,
 * but the sizes already orphaned are still live, and only the owner knows
 * which were deliberate.
 *
 * So this reports and changes nothing. The useful signal is a size that has
 * never been ordered on a dish whose OTHER sizes have: it was either removed
 * in the editor and survived, or it is a real option nobody has ever picked —
 * and both are worth a look.
 */
class ListStaleVariants extends Command
{
    protected $signature = 'menu:stale-variants
        {--all : Include sizes on dishes that have never sold at all}';

    protected $description = 'List sizes that have never been ordered (read-only; changes nothing)';

    public function handle(): int
    {
        $variants = Variant::query()
            ->with('item:id,name,is_active')
            ->where('is_active', true)
            ->orderBy('item_id')
            ->orderBy('sort_order')
            ->get();

        if ($variants->isEmpty()) {
            $this->info('No active sizes on the menu.');

            return self::SUCCESS;
        }

        // One query for the lot rather than one per size.
        $soldVariantIds = OrderItem::query()
            ->whereIn('variant_id', $variants->pluck('id'))
            ->distinct()
            ->pluck('variant_id')
            ->map(fn ($id) => (int) $id)
            ->flip();

        $itemsWithSales = OrderItem::query()
            ->whereIn('item_id', $variants->pluck('item_id')->unique())
            ->distinct()
            ->pluck('item_id')
            ->map(fn ($id) => (int) $id)
            ->flip();

        $includeUnsoldDishes = (bool) $this->option('all');

        $rows = $variants
            ->reject(fn (Variant $v) => $soldVariantIds->has((int) $v->id))
            ->filter(function (Variant $v) use ($itemsWithSales, $includeUnsoldDishes) {
                // A brand-new dish has no sales on any size yet — that is not a
                // leftover, it is a dish that has not opened. Hidden unless asked.
                return $includeUnsoldDishes || $itemsWithSales->has((int) $v->item_id);
            })
            ->map(fn (Variant $v) => [
                $v->item?->name ?? '(item ' . $v->item_id . ')',
                $v->name,
                number_format((float) $v->price, 2),
                $v->is_available ? 'yes' : 'sold out',
                $v->created_at?->toDateString() ?? '—',
            ])
            ->values();

        if ($rows->isEmpty()) {
            $this->info('No sizes look left over — every active size has been ordered at least once.');

            if (!$includeUnsoldDishes) {
                $this->line('  (Sizes on dishes that have never sold at all are hidden; add --all to see them.)');
            }

            return self::SUCCESS;
        }

        $this->warn($rows->count() . ' size(s) have never been ordered on a dish that does sell:');
        $this->table(['Dish', 'Size', 'Price', 'Available', 'Added'], $rows->all());

        $this->newLine();
        $this->line('Nothing was changed. Each of these is either a size somebody removed in the');
        $this->line('editor before that actually deleted anything, or a real option no customer has');
        $this->line('picked yet — only you can tell which.');
        $this->line('To remove one: open the dish in Menu → Edit, delete the row, save. That now');
        $this->line('deletes it for real.');

        return self::SUCCESS;
    }
}
