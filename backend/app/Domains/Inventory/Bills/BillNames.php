<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Bills;

use App\Models\InventoryItem;
use App\Models\Supplier;
use Illuminate\Support\Facades\DB;

/**
 * What bills call things, remembered (owner, 2026-11-15: "one shop may have 2-3
 * branches so invoice will be in different shops name. But actually it's one shop.
 * Some items also like that").
 *
 * Nobody fills this in. When a bill becomes a purchase, the name the bill gave the
 * shop and the wording of each line are kept beside the supplier and the inventory
 * item the person settled on (`learn()`). The next bill with that wording is matched
 * to the same supplier and item before anyone looks (`BillReader::tidy()`), and the
 * reader is shown the list so near-identical wordings follow (`hints()`). A wording
 * settled differently later simply replaces the old answer.
 */
class BillNames
{
    private const TABLE = 'bill_names';

    /** "C/COLA 500ML  PET." and "c cola 500ml pet" are one wording. */
    public static function key(string $text): string
    {
        return mb_substr(trim((string) preg_replace('/[^\p{L}\p{N}]+/u', ' ', mb_strtolower($text))), 0, 191);
    }

    public function remember(string $kind, string $text, int $targetId): void
    {
        $key = self::key($text);
        if ($key === '' || $targetId <= 0) {
            return;
        }
        $column = $kind === 'shop' ? 'supplier_id' : 'inventory_item_id';
        $row = DB::table(self::TABLE)->where('kind', $kind)->where('key', $key)->first();
        if ($row === null) {
            DB::table(self::TABLE)->insert([
                'kind' => $kind, 'key' => $key, 'text' => mb_substr(trim($text), 0, 255), $column => $targetId,
                'uses' => 1, 'created_at' => now(), 'updated_at' => now(),
            ]);

            return;
        }
        DB::table(self::TABLE)->where('id', $row->id)->update([
            $column => $targetId,
            // The same answer again is one more use; a new answer starts over.
            'uses' => (int) $row->{$column} === $targetId ? $row->uses + 1 : 1,
            'updated_at' => now(),
        ]);
    }

    /**
     * A bill was saved as a purchase: keep what it called the shop and each line,
     * where that differs from the name on file.
     *
     * @param array<int, array{bill_name: string, inventory_item_id: int}> $lines
     */
    public function learn(string $billShop, ?Supplier $supplier, array $lines): void
    {
        if ($supplier !== null && self::key($billShop) !== self::key((string) $supplier->name)) {
            $this->remember('shop', $billShop, (int) $supplier->id);
        }
        $names = InventoryItem::query()->whereIn('id', array_column($lines, 'inventory_item_id'))->pluck('name', 'id');
        foreach ($lines as $line) {
            $name = (string) ($names[$line['inventory_item_id']] ?? '');
            if ($name !== '' && self::key($line['bill_name']) !== self::key($name)) {
                $this->remember('item', $line['bill_name'], $line['inventory_item_id']);
            }
        }
    }

    /** The supplier's name on file for what a bill calls the shop, if it has been seen. */
    public function shopFor(string $text): ?string
    {
        $id = DB::table(self::TABLE)->where('kind', 'shop')->where('key', self::key($text))->value('supplier_id');

        return $id === null ? null : Supplier::query()->whereKey($id)->value('name');
    }

    /** The active inventory item a wording was settled on, if it has been seen. */
    public function itemFor(string $text): ?int
    {
        $id = DB::table(self::TABLE)->where('kind', 'item')->where('key', self::key($text))->value('inventory_item_id');

        return $id !== null && InventoryItem::query()->whereKey($id)->where('is_active', true)->exists() ? (int) $id : null;
    }

    /** For the reader: the wordings people have settled, most used first. */
    public function hints(int $limit = 300): string
    {
        $shops = DB::table(self::TABLE)->where(self::TABLE . '.kind', 'shop')->join('suppliers', 'suppliers.id', '=', self::TABLE . '.supplier_id')
            ->orderByDesc(self::TABLE . '.uses')->limit(100)->get([self::TABLE . '.text', 'suppliers.name'])
            ->map(fn ($r) => $r->text . ' → ' . $r->name)->all();
        $items = DB::table(self::TABLE)->where('kind', 'item')->whereNotNull('inventory_item_id')
            ->orderByDesc('uses')->orderByDesc('updated_at')->limit($limit)->get(['text', 'inventory_item_id'])
            ->map(fn ($r) => $r->text . ' → ' . $r->inventory_item_id)->all();

        return "Names earlier bills gave a shop, and the supplier it is (name on the bill → supplier):\n" . ($shops === [] ? '(none yet)' : implode("\n", $shops))
            . "\n\nWordings on earlier bills, and the inventory item a person chose (wording → item id):\n" . ($items === [] ? '(none yet)' : implode("\n", $items));
    }
}
