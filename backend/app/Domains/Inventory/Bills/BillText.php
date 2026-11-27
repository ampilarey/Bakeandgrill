<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Bills;

use App\Models\InventoryItem;
use App\Models\Supplier;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * A bill read by Tesseract in the browser, turned into the reading the form takes (owner, 2026-11-27: a free
 * reader beside Claude and Google). Tesseract gives lines of text and nothing more, so this is plain rules, not
 * understanding: the shop is a supplier on file whose name is on the bill, a line of goods is a row whose
 * quantity times its price comes to its amount, and an item is matched only when its name, or a wording a person
 * settled on an earlier bill, is on the line. Everything else is left for the person: a line it cannot place has
 * no item, and nothing is guessed. Answers in BillVision::SCHEMA's shape, for BillReader::tidy().
 */
class BillText
{
    /** Words that mark a row as a sum or a note, never goods. */
    private const NOT_GOODS = '/\b(sub\s*-?\s*total|total|g\.?s\.?t|tax|vat|cash|change|balance|paid|tender|round(ing|ed)?|discount|card|visa|master|amount due|invoice|receipt|bill no|tin|tel|phone|mobile|date|time|cashier|table|thank)\b/i';

    private const NUM = '(\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?|\d+(?:\.\d{1,3})?)';

    /**
     * @param list<string> $lines the bill's text, a line of the paper to a line
     * @return array<string, mixed>
     */
    public function read(array $lines): array
    {
        $lines = array_values(array_filter(array_map(fn ($l) => trim(preg_replace('/\s+/u', ' ', (string) $l) ?? ''), $lines), fn (string $l) => $l !== ''));
        $names = app(BillNames::class);
        $items = InventoryItem::query()->where('is_active', true)->get(['id', 'name']);
        // Longest names first, so "Coconut Milk" is found before "Milk".
        $byKey = $items->mapWithKeys(fn (InventoryItem $i) => [BillNames::key((string) $i->name) => (int) $i->id])
            ->filter(fn ($id, $key) => mb_strlen((string) $key) >= 3)
            ->sortByDesc(fn ($id, $key) => mb_strlen((string) $key));

        $goods = [];
        foreach ($lines as $line) {
            $row = $this->row($line);
            if ($row === null) {
                continue;
            }
            $key = BillNames::key($row['name']);
            $id = $names->itemFor($row['name']);
            if ($id === null) {
                foreach ($byKey as $itemKey => $itemId) {
                    if ($key === $itemKey || str_contains($key, (string) $itemKey)) {
                        $id = $itemId;
                        break;
                    }
                }
            }
            $goods[] = [
                'name' => $row['name'], 'item_id' => $id ?? 0, 'brand' => '', 'new_name' => $row['name'], 'new_unit' => '',
                'quantity' => $row['qty'], 'unit' => '', 'pack_size' => 0,
                'unit_price' => $row['price'], 'amount' => $row['amount'], 'gst' => false,
                // A row with no quantity and price of its own is one of something at that amount: for the person to check.
                'unsure' => $row['unsure'],
            ];
        }

        $total = $this->total($lines);

        return [
            'is_bill' => $goods !== [],
            'shop' => $this->shop($lines),
            'bill_no' => $this->billNo($lines),
            'date' => $this->date($lines),
            'total' => $total,
            'gst_total' => $this->labelled($lines, '/\b(g\.?s\.?t|tax|vat)\b/i'),
            'note' => $goods === [] ? 'No lines of goods could be read from this. Try a clearer, straighter photo, or type the bill.' : 'Read by Tesseract: check every line against the bill.',
            'lines' => $goods,
        ];
    }

    /**
     * A row of goods: its words, then quantity, price and amount with quantity × price = amount; or its words and
     * one amount with two decimals.
     *
     * @return array{name: string, qty: float, price: float, amount: float, unsure: bool}|null
     */
    private function row(string $line): ?array
    {
        if (preg_match(self::NOT_GOODS, $line) === 1) {
            return null;
        }
        $n = self::NUM;
        // "Coca Cola 500ml  24 x 12.50  300.00", "Sugar 2 45.00 90.00", "Rice 5kg 3 @ 120.00 360.00"
        if (preg_match('/^(.*?\p{L}.*?)\s+' . $n . '\s*(?:x|X|×|@|\*)?\s*' . $n . '\s+(?:=\s*)?' . $n . '$/u', $line, $m) === 1) {
            [$a, $b, $c] = [$this->num($m[2]), $this->num($m[3]), $this->num($m[4])];
            if ($a > 0 && $b > 0 && $c > 0 && abs($a * $b - $c) <= max(0.05, $c * 0.005)) {
                return ['name' => $this->words($m[1]), 'qty' => $a, 'price' => $b, 'amount' => $c, 'unsure' => false];
            }
        }
        // "Bread loaf  25.00": one of it. The two decimals keep a phone or a code from reading as money.
        if (preg_match('/^(.*?\p{L}.*?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})$/u', $line, $m) === 1) {
            $amount = $this->num($m[2]);
            $name = $this->words($m[1]);
            if ($amount > 0 && mb_strlen($name) >= 3) {
                return ['name' => $name, 'qty' => 1.0, 'price' => $amount, 'amount' => $amount, 'unsure' => true];
            }
        }

        return null;
    }

    /** The row's words without a leading line number or trailing punctuation. */
    private function words(string $text): string
    {
        return mb_substr(trim((string) preg_replace('/^\d{1,3}[.)]\s+/', '', trim($text, " \t-:.|"))), 0, 255);
    }

    private function num(string $s): float
    {
        return round((float) str_replace(',', '', $s), 4);
    }

    /**
     * The supplier on file, or a name an earlier bill gave one, that is written on this bill.
     *
     * @param list<string> $lines
     */
    private function shop(array $lines): string
    {
        $text = BillNames::key(implode(' ', array_slice($lines, 0, 12)));
        $suppliers = Supplier::query()->pluck('name')->filter()->unique()
            ->sortByDesc(fn ($n) => mb_strlen((string) $n));
        foreach ($suppliers as $name) {
            $key = BillNames::key((string) $name);
            if (mb_strlen($key) >= 4 && str_contains($text, $key)) {
                return (string) $name;
            }
        }
        $names = app(BillNames::class);
        $ours = array_map(fn (string $n) => BillNames::key($n), app(BillReaderSettings::class)->ourNames());
        foreach (array_slice($lines, 0, 6) as $line) {
            if ($names->shopFor($line) !== null) {
                return $line;
            }
        }
        // Else the first line of words at the top that is not us: a bill is headed with its shop.
        foreach (array_slice($lines, 0, 4) as $line) {
            $key = BillNames::key($line);
            if (mb_strlen($key) >= 4 && preg_match('/\p{L}{3,}/u', $line) === 1 && preg_match('/\d{4,}/', $line) !== 1 && !in_array($key, $ours, true)) {
                return mb_substr($line, 0, 255);
            }
        }

        return '';
    }

    /** @param list<string> $lines */
    private function billNo(array $lines): string
    {
        foreach ($lines as $line) {
            if (preg_match('/\b(?:invoice|inv|bill|receipt|rcpt)\s*(?:no|number|#)?\s*[.:#-]?\s*([A-Z0-9][A-Z0-9\/-]{2,30})\b/i', $line, $m) === 1 && preg_match('/\d/', $m[1]) === 1) {
                return $m[1];
            }
        }

        return '';
    }

    /**
     * The bill's day as YYYY-MM-DD, day before month as bills here write it; "" when none is plain.
     *
     * @param list<string> $lines
     */
    private function date(array $lines): string
    {
        foreach ($lines as $line) {
            try {
                if (preg_match('/\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/', $line, $m) === 1) {
                    $d = Carbon::createStrict((int) $m[1], (int) $m[2], (int) $m[3]);
                } elseif (preg_match('/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/', $line, $m) === 1) {
                    $year = (int) $m[3] < 100 ? 2000 + (int) $m[3] : (int) $m[3];
                    $d = Carbon::createStrict($year, (int) $m[2], (int) $m[1]);
                } elseif (preg_match('/\b(\d{1,2})[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]+(\d{2,4})\b/i', $line, $m) === 1) {
                    $year = (int) $m[3] < 100 ? 2000 + (int) $m[3] : (int) $m[3];
                    $d = Carbon::parse("{$m[1]} {$m[2]} {$year}");
                } else {
                    continue;
                }
                if ($d->year >= 2015 && !$d->isAfter(now()->endOfDay())) {
                    return $d->format('Y-m-d');
                }
            } catch (Throwable) {
                // Not a date after all: the next line may hold one.
            }
        }

        return '';
    }

    /**
     * The grand total: the largest amount on a line that says total (a subtotal is smaller or equal).
     *
     * @param list<string> $lines
     */
    private function total(array $lines): float
    {
        $best = 0.0;
        foreach ($lines as $line) {
            if (preg_match('/\b(grand\s+total|net\s+total|total|amount\s+due)\b/i', $line) === 1 && preg_match('/sub\s*-?\s*total/i', $line) !== 1
                && preg_match('/' . self::NUM . '\s*$/', $line, $m) === 1) {
                $best = max($best, $this->num($m[1]));
            }
        }

        return round($best, 2);
    }

    /** @param list<string> $lines */
    private function labelled(array $lines, string $label): float
    {
        foreach ($lines as $line) {
            if (preg_match($label, $line) === 1 && preg_match('/total/i', $line) !== 1 && preg_match('/' . self::NUM . '\s*$/', $line, $m) === 1) {
                return round($this->num($m[1]), 2);
            }
        }

        return 0.0;
    }
}
