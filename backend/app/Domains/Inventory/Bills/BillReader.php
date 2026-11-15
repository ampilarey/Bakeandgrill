<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Bills;

use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseBill;
use App\Models\PurchaseReceipt;
use App\Models\Supplier;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * A supplier's bill, sent in as a photo, scan or PDF, read into the boxes of a manual
 * purchase order (owner, 2026-11-15: "I have a pile of bills to enter. But I have no
 * time… so admin just needs to check and approve").
 *
 * Nothing here makes a purchase. A bill is read into `purchase_bills.data`, a person
 * checks it on the manual PO form, and PurchaseController::store makes the purchase
 * through the one path every manual PO takes, then calls `used()`.
 */
class BillReader
{
    /** A reading that started this long ago and never finished was killed: it goes back in the queue. */
    public const STALE_MINUTES = 5;

    /** The long edge a photo is sent at: enough for small print, well under the API's limits. */
    private const MAX_EDGE = 2200;

    public function __construct(private readonly BillVision $vision) {}

    public function enabled(): bool
    {
        return $this->vision->enabled();
    }

    /**
     * Read one bill, unless someone else is already reading it. Returns the row as it
     * stands afterwards: ready, failed, or still reading elsewhere.
     */
    public function read(PurchaseBill $bill): PurchaseBill
    {
        // One reader per bill: the screen that uploaded it and the scheduler both ask.
        $claimed = PurchaseBill::query()->whereKey($bill->id)
            ->whereIn('status', [PurchaseBill::QUEUED, PurchaseBill::FAILED])
            ->update(['status' => PurchaseBill::READING, 'reading_at' => now(), 'error' => null]);
        if ($claimed === 0) {
            return $bill->refresh();
        }

        try {
            [$bytes, $mime] = $this->fileFor($bill);
            $data = $this->tidy($this->vision->read($bytes, $mime, $this->context()));
            if (!$data['is_bill'] || $data['lines'] === []) {
                throw new BillUnreadable($data['note'] !== '' ? $data['note'] : 'Nothing on this could be read as a bill. Try a clearer photo, or type it.');
            }
            $bill->forceFill(['status' => PurchaseBill::READY, 'data' => $data, 'error' => null])->save();
        } catch (BillUnreadable $e) {
            $bill->forceFill(['status' => PurchaseBill::FAILED, 'error' => mb_substr($e->getMessage(), 0, 500)])->save();
        } catch (Throwable $e) {
            Log::error('Bill reading broke', ['bill' => $bill->id, 'error' => $e->getMessage()]);
            report($e);
            $bill->forceFill(['status' => PurchaseBill::FAILED, 'error' => 'This bill could not be read. Try it again, or type it.'])->save();
        }

        $bill->refresh();
        // Sent to the staff bot as a photo: the reading goes back to that chat.
        if ($bill->telegram_link_id !== null) {
            app(\App\Domains\Telegram\Services\TelegramBills::class)->tell($bill);
        }

        return $bill;
    }

    /**
     * Keep one bill's file as a queued row. The same file is not taken twice.
     *
     * @throws BillUnreadable when this very file was sent before
     */
    public function keep(string $bytes, string $name, string $mime, ?int $userId, ?int $telegramLinkId = null): PurchaseBill
    {
        $hash = sha1($bytes);
        $same = PurchaseBill::query()->where('file_hash', $hash)->latest('id')->first();
        if ($same !== null) {
            throw new BillUnreadable($same->status === PurchaseBill::DONE
                ? 'This bill was already entered on ' . $same->updated_at?->format('j M Y') . '.'
                : 'This bill is already on the list.');
        }
        $ext = ['application/pdf' => 'pdf', 'image/png' => 'png', 'image/webp' => 'webp'][$mime] ?? 'jpg';
        $path = 'purchase-receipts/bills/' . now()->format('Y/m') . '/' . bin2hex(random_bytes(16)) . '.' . $ext;
        Storage::disk('local')->put($path, $bytes);

        return PurchaseBill::create([
            'user_id' => $userId,
            'telegram_link_id' => $telegramLinkId,
            'file_path' => $path,
            'file_name' => mb_substr($name, 0, 255) ?: 'bill.' . $ext,
            'mime_type' => $mime,
            'file_hash' => $hash,
            'status' => PurchaseBill::QUEUED,
        ]);
    }

    /**
     * What stands between a read bill and a purchase, sorted by who can settle it.
     *
     * `blocking` needs the form in Admin (a figure hard to read, lines that do not add
     * up, an unknown product for someone who may not add items). The rest can be settled
     * where the bill is being approved: `new_items` are lines whose product is not on
     * file but has a name and a unit to add it by, `new_packs` are lines sold in a pack
     * the item does not have whose size the bill gave, and `ask_packs` are such lines
     * whose size the person has to say. Each is a list of line positions.
     *
     * @return array{blocking: list<string>, new_items: list<int>, new_packs: list<int>, ask_packs: list<int>}
     */
    public function review(PurchaseBill $bill, bool $mayAddItems = false): array
    {
        $out = ['blocking' => [], 'new_items' => [], 'new_packs' => [], 'ask_packs' => []];
        $data = $this->present($bill)['data'];
        if (!is_array($data) || $bill->status !== PurchaseBill::READY) {
            $out['blocking'][] = 'It has not been read.';

            return $out;
        }
        if (trim((string) $data['shop']) === '') {
            $out['blocking'][] = 'The shop could not be read.';
        }
        if (empty($data['date'])) {
            $out['blocking'][] = 'The date could not be read.';
        }
        if (!empty($data['seen_before'])) {
            $out['blocking'][] = 'A purchase with this bill number is already on file.';
        }
        $noItem = $unsure = 0;
        foreach ($data['lines'] as $i => $line) {
            if (!empty($line['unsure'])) {
                $unsure++;
            }
            $own = mb_strtolower(trim((string) ($line['item']['unit'] ?? '')));
            if (empty($line['item'])) {
                if (!$mayAddItems || trim((string) $line['new_name']) === '' || trim((string) $line['new_unit']) === '') {
                    $noItem++;

                    continue;
                }
                $out['new_items'][] = $i;
                $own = mb_strtolower(trim((string) $line['new_unit']));
            }
            if ($line['unit'] !== '' && $line['unit'] !== $own && (empty($line['item']) || $this->packFor($line) === null)) {
                $out[($line['pack_size'] ?? 0) > 0 ? 'new_packs' : 'ask_packs'][] = $i;
            }
        }
        if ($noItem > 0) {
            $out['blocking'][] = $noItem === 1 ? '1 line is not in your inventory.' : "{$noItem} lines are not in your inventory.";
        }
        if ($unsure > 0) {
            $out['blocking'][] = $unsure === 1 ? '1 line was hard to read.' : "{$unsure} lines were hard to read.";
        }
        if ($data['total'] > 0 && abs($data['total'] - $data['lines_total']) > 0.05) {
            $out['blocking'][] = 'The lines do not add up to the bill\'s total.';
        }

        return $out;
    }

    /** Nothing left for a person to decide: `purchasePayload()` can be saved as it is. */
    public function ready(array $review): bool
    {
        return $review['blocking'] === [] && $review['new_items'] === [] && $review['new_packs'] === [] && $review['ask_packs'] === [];
    }

    /** How many of the item's own unit one of a line's packs holds, as the person said. */
    public function setPackSize(PurchaseBill $bill, int $line, float $size): void
    {
        $data = $bill->data;
        if (isset($data['lines'][$line]) && $size > 0) {
            $data['lines'][$line]['pack_size'] = round($size, 4);
            $bill->forceFill(['data' => $data])->save();
        }
    }

    /**
     * Do what `review()` said could be done here: add the new products to the inventory
     * (an item already on file under that name is used, never doubled) and define the
     * packs whose size is known. Stock is not touched: the purchase puts it in.
     *
     * @param array{new_items: list<int>, new_packs: list<int>} $review
     */
    public function settle(PurchaseBill $bill, array $review): void
    {
        \Illuminate\Support\Facades\DB::transaction(function () use ($bill, $review) {
            $data = $bill->data;
            foreach ($review['new_items'] as $i) {
                $line = $data['lines'][$i] ?? null;
                if ($line === null || !empty($line['item_id'])) {
                    continue;
                }
                $name = trim((string) $line['new_name']);
                $item = InventoryItem::query()->where('is_active', true)
                    ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($name)])->first()
                    ?? InventoryItem::create(['name' => $name, 'unit' => trim((string) $line['new_unit']), 'current_stock' => 0, 'is_active' => true]);
                $data['lines'][$i]['item_id'] = $item->id;
            }
            foreach ($review['new_packs'] as $i) {
                $line = $data['lines'][$i] ?? null;
                $itemId = (int) ($line['item_id'] ?? 0);
                if ($line === null || $itemId === 0 || ($line['pack_size'] ?? 0) <= 0) {
                    continue;
                }
                $has = \App\Models\InventoryPurchaseUnit::query()->where('inventory_item_id', $itemId)->get(['name'])
                    ->contains(fn ($p) => mb_strtolower(trim((string) $p->name)) === $line['unit']);
                if (!$has) {
                    \App\Models\InventoryPurchaseUnit::create([
                        'inventory_item_id' => $itemId,
                        'brand_key' => '',
                        'name' => mb_convert_case($line['unit'], MB_CASE_TITLE),
                        'base_units' => $line['pack_size'],
                    ]);
                }
            }
            $bill->forceFill(['data' => $data])->save();
        });
    }

    /**
     * The bill as the manual order's payload, for a bill whose `review()` is `ready()`.
     *
     * @return array<string, mixed>
     */
    public function purchasePayload(PurchaseBill $bill, bool $paid): array
    {
        $data = $this->present($bill)['data'];
        $items = [];
        foreach ($data['lines'] as $line) {
            $pack = $line['unit'] !== '' ? $this->packFor($line) : null;
            $items[] = array_filter([
                'inventory_item_id' => $line['item']['id'],
                'name' => $line['item']['name'],
                'quantity' => $line['quantity'],
                'unit_cost' => $line['unit_price'],
                'purchase_unit_id' => $pack,
                'gst_rate_bp' => $line['gst'] ? 800 : 0,
            ], fn ($v) => $v !== null);
        }

        return array_filter([
            'supplier_name_text' => $data['shop'],
            'purchase_date' => $data['date'],
            'supplier_invoice_no' => $data['bill_no'] !== '' ? $data['bill_no'] : null,
            'bill_id' => $bill->id,
            // The bill is in hand, so the goods are on the shelf: stock goes in with the order.
            'status' => 'received',
            'items' => $items,
            'paid' => $paid ? 'full' : 'none',
            'paid_method' => $paid ? 'cash' : null,
        ], fn ($v) => $v !== null);
    }

    /** The id of the item's pack the line's unit names, if it has one by that name. */
    private function packFor(array $line): ?int
    {
        $id = \App\Models\InventoryPurchaseUnit::query()
            ->where('inventory_item_id', $line['item']['id'])
            ->get(['id', 'name'])
            ->first(fn ($p) => mb_strtolower(trim((string) $p->name)) === $line['unit'])?->id;

        return $id === null ? null : (int) $id;
    }

    /**
     * A made-up bill drawn here and sent to a service, to prove its key and model work
     * (the Test button on Purchasing → Settings → Reading bills). Costs one small read.
     *
     * @return array{shop: string, lines: int, total: float}
     *
     * @throws BillUnreadable
     */
    public function trial(string $provider): array
    {
        $image = imagecreatetruecolor(700, 420);
        imagefill($image, 0, 0, 0xFFFFFF);
        foreach ([
            'CORNER SHOP PVT LTD', 'Cash bill no. 1001', '',
            'RICE 5KG BAG        2 x 85.00     170.00',
            'COOKING OIL 2L      1 x 64.00      64.00', '',
            'TOTAL MVR                         234.00',
        ] as $i => $row) {
            imagestring($image, 5, 30, 30 + $i * 48, $row, 0x000000);
        }
        ob_start();
        imagejpeg($image, null, 90);
        $jpeg = (string) ob_get_clean();

        $data = $this->tidy($this->vision->read($jpeg, 'image/jpeg', $this->context(), $provider));

        return ['shop' => $data['shop'], 'lines' => count($data['lines']), 'total' => $data['total']];
    }

    /** Bills nobody is reading: queued ones, and ones whose reader was killed. For the scheduler. */
    public function readWaiting(int $limit = 5): int
    {
        PurchaseBill::query()->where('status', PurchaseBill::READING)
            ->where('reading_at', '<', now()->subMinutes(self::STALE_MINUTES))
            // Dated back, so it is past the minute's grace below and is read in this run.
            ->update(['status' => PurchaseBill::QUEUED, 'updated_at' => now()->subMinutes(2)]);

        $done = 0;
        // A minute's grace: the screen that sent a bill reads it itself straight away.
        $bills = PurchaseBill::query()->where('status', PurchaseBill::QUEUED)
            ->where('updated_at', '<', now()->subMinute())
            ->orderBy('id')->limit($limit)->get();
        foreach ($bills as $bill) {
            $this->read($bill);
            $done++;
        }

        return $done;
    }

    /** The bill became this purchase: its file is the purchase's receipt and it leaves the list. */
    public function used(PurchaseBill $bill, Purchase $purchase, ?int $userId): void
    {
        PurchaseReceipt::create([
            'purchase_id' => $purchase->id,
            'user_id' => $userId,
            'file_path' => $bill->file_path,
            'file_name' => $bill->file_name,
            'mime_type' => $bill->mime_type,
        ]);
        $bill->forceFill(['status' => PurchaseBill::DONE, 'purchase_id' => $purchase->id])->save();
    }

    /**
     * The row as the screen gets it.
     *
     * @return array<string, mixed>
     */
    public function present(PurchaseBill $bill): array
    {
        $data = $bill->data;
        if (is_array($data)) {
            // The items as they are now, not as they were when the bill was read.
            $ids = array_values(array_filter(array_column($data['lines'] ?? [], 'item_id')));
            $items = InventoryItem::query()->whereIn('id', $ids)->where('is_active', true)->get()->keyBy('id');
            $data['lines'] = array_map(function (array $line) use ($items) {
                $item = $line['item_id'] ? $items->get($line['item_id']) : null;
                $line['item_id'] = $item?->id;
                $line['item'] = $item?->toArray();

                return $line;
            }, $data['lines'] ?? []);
            $data['seen_before'] = $this->seenBefore($data);
        }

        return [
            'id' => $bill->id,
            'status' => $bill->status,
            'file_name' => $bill->file_name,
            'is_image' => str_starts_with($bill->mime_type, 'image/'),
            'error' => $bill->error,
            'sent_at' => $bill->created_at?->toIso8601String(),
            'data' => $data,
        ];
    }

    /** A purchase already on file with this shop's bill number: the bill may have been entered. */
    private function seenBefore(array $data): ?array
    {
        $no = trim((string) ($data['bill_no'] ?? ''));
        if ($no === '') {
            return null;
        }
        $purchase = Purchase::query()->where('supplier_invoice_no', $no)->latest('id')->first();

        return $purchase === null ? null : [
            'purchase_id' => $purchase->id,
            'purchase_date' => $purchase->purchase_date ? Carbon::parse($purchase->purchase_date)->toDateString() : null,
        ];
    }

    /** What is on file, so a line can be matched to an item and a shop to a supplier. */
    public function context(): string
    {
        $items = InventoryItem::query()->where('is_active', true)->with('purchaseUnits')->orderBy('id')->get();
        $rows = $items->map(function (InventoryItem $item) {
            $packs = $item->purchaseUnits
                ->map(fn ($p) => trim($p->name) . ' = ' . rtrim(rtrim((string) $p->base_units, '0'), '.') . ' ' . $item->unit)
                ->unique()->values()->all();

            return $item->id . ' | ' . $item->name . ' | ' . $item->unit . ($packs === [] ? '' : ' | packs: ' . implode('; ', $packs));
        })->all();
        $suppliers = Supplier::query()->orderBy('name')->pluck('name')->filter()->unique()->values()->all();

        return "Inventory items (id | name | own unit | packs):\n" . ($rows === [] ? '(none yet)' : implode("\n", $rows))
            . "\n\nSuppliers on file:\n" . ($suppliers === [] ? '(none yet)' : implode("\n", $suppliers));
    }

    /**
     * Claude's answer, held to what the form can take: known items only, a real date
     * that is not in the future, figures that are numbers, and a line whose sum does
     * not come to its amount marked for the person's eye.
     *
     * @param array<string, mixed> $raw
     * @return array<string, mixed>
     */
    public function tidy(array $raw): array
    {
        $known = InventoryItem::query()->where('is_active', true)->pluck('id')->flip();
        $num = fn ($v): float => is_numeric($v) && (float) $v > 0 ? round((float) $v, 4) : 0.0;
        $text = fn ($v, int $max = 255): string => mb_substr(trim((string) (is_scalar($v) ? $v : '')), 0, $max);

        $lines = [];
        foreach (is_array($raw['lines'] ?? null) ? $raw['lines'] : [] as $line) {
            if (!is_array($line)) {
                continue;
            }
            $id = (int) ($line['item_id'] ?? 0);
            $qty = $num($line['quantity'] ?? 0);
            $price = $num($line['unit_price'] ?? 0);
            $amount = $num($line['amount'] ?? 0);
            $unsure = (bool) ($line['unsure'] ?? false);
            if ($qty <= 0) {
                $qty = 1.0;
                $unsure = true;
            }
            if ($price <= 0 && $amount > 0) {
                $price = round($amount / $qty, 4);
            }
            if ($amount <= 0) {
                $amount = round($qty * $price, 2);
            }
            if ($price <= 0 || abs($qty * $price - $amount) > max(0.05, $amount * 0.005)) {
                $unsure = true;
            }
            $name = $text($line['name'] ?? '');
            if ($name === '' && $id === 0) {
                continue;
            }
            $lines[] = [
                'name' => $name,
                'item_id' => $known->has($id) ? $id : null,
                'new_name' => $text($line['new_name'] ?? '') ?: $name,
                'new_unit' => $text($line['new_unit'] ?? '', 40),
                'quantity' => $qty,
                'unit' => mb_strtolower($text($line['unit'] ?? '', 40)),
                'pack_size' => $num($line['pack_size'] ?? 0),
                'unit_price' => $price,
                'amount' => round($amount, 2),
                'gst' => (bool) ($line['gst'] ?? false),
                'unsure' => $unsure,
            ];
        }

        $date = $text($raw['date'] ?? '', 10);
        try {
            $parsed = preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? Carbon::createFromFormat('Y-m-d', $date) : null;
            $date = $parsed !== null && $parsed->format('Y-m-d') === $date && !$parsed->isAfter(now()->endOfDay()) ? $date : null;
        } catch (Throwable) {
            $date = null;
        }

        return [
            'is_bill' => (bool) ($raw['is_bill'] ?? false),
            'shop' => $text($raw['shop'] ?? ''),
            'bill_no' => $text($raw['bill_no'] ?? '', 64),
            'date' => $date,
            'total' => round($num($raw['total'] ?? 0), 2),
            'gst_total' => round($num($raw['gst_total'] ?? 0), 2),
            'note' => $text($raw['note'] ?? '', 300),
            'lines' => $lines,
            'lines_total' => round(array_sum(array_column($lines, 'amount')), 2),
        ];
    }

    /**
     * The file as it is sent: a PDF as it came, a photo turned the right way up and
     * brought down to a size that reads well.
     *
     * @return array{0: string, 1: string} bytes and media type
     */
    private function fileFor(PurchaseBill $bill): array
    {
        $bytes = Storage::disk('local')->get($bill->file_path);
        if ($bytes === null || $bytes === '') {
            throw new BillUnreadable('The file for this bill is gone. Send it again.');
        }
        if ($bill->mime_type === 'application/pdf') {
            return [$bytes, 'application/pdf'];
        }

        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            throw new BillUnreadable('This picture could not be opened. Send it as a JPG, a PNG or a PDF.');
        }
        $image = $this->upright($image, $bytes);
        $w = imagesx($image);
        $h = imagesy($image);
        $scale = min(1, self::MAX_EDGE / max($w, $h));
        if ($scale < 1) {
            $small = imagescale($image, (int) round($w * $scale), (int) round($h * $scale), IMG_BICUBIC);
            if ($small !== false) {
                $image = $small;
            }
        }
        ob_start();
        imagejpeg($image, null, 88);
        $jpeg = (string) ob_get_clean();

        return [$jpeg, 'image/jpeg'];
    }

    /** A phone photo says which way up it is in its EXIF; GD ignores that. */
    private function upright(\GdImage $image, string $bytes): \GdImage
    {
        if (!function_exists('exif_read_data')) {
            return $image;
        }
        $exif = @exif_read_data('data://image/jpeg;base64,' . base64_encode($bytes));
        $turn = match ((int) ($exif['Orientation'] ?? 1)) {
            3 => 180, 6 => -90, 8 => 90, default => 0,
        };
        if ($turn === 0) {
            return $image;
        }
        $turned = imagerotate($image, $turn, 0);

        return $turned === false ? $image : $turned;
    }
}
