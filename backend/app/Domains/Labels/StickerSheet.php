<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;
use App\Models\Item;
use App\Models\KitchenProductionItem;
use App\Models\LabelBrand;
use App\Models\LabelFooter;
use App\Models\LabelType;
use App\Support\ComplaintBoxLink;
use App\Support\QrSvg;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use InvalidArgumentException;

/**
 * A sheet (or a run of sheets) of pack stickers: which products, how many of
 * each, in which language, on which label stock, and what goes in the date,
 * batch and quantity boxes. A product is a menu item or a custom label (owner,
 * 2026-10-11: "Not only from the menu list"), told apart by `kind`.
 *
 * The request travels in a signed URL (LabelLinks) from the Labels page, a
 * production batch or a wholesale delivery; normalise() is the one place its
 * rules live, for the API that issues the link and the page that draws it.
 */
final class StickerSheet
{
    public const MAX_STICKERS = 400;

    /** English, Dhivehi, or both on one sticker (2026-10-12). */
    public const LANGS = ['en', 'dv', 'both'];

    /** The brand mark's share of the full sticker's complaints QR: smaller than the poster's 0.26, for an 11.5 mm code. */
    public const QR_LOGO_RATIO = 0.2;

    /** A custom label still being written previews from the cache under this key (2026-10-12). */
    public const DRAFT_CACHE = 'label-draft:';

    public const DRAFT_MINUTES = 30;

    /** @var array<int, ?LabelType> */
    private array $asTypes = [];

    public function __construct(private readonly LabelIngredients $ingredients, private readonly LabelTypes $types, private readonly Nutrition $nutrition) {}

    /** The label type a sheet is printed "as", when the request names one. */
    private function asType(array $req): ?LabelType
    {
        $id = (int) ($req['type'] ?? 0);
        if ($id <= 0) {
            return null;
        }

        return $this->asTypes[$id] ??= LabelType::query()->with('brand')->find($id);
    }

    /**
     * Check and tidy a request. Throws InvalidArgumentException with a message
     * fit to show the person printing.
     *
     * @param array<string, mixed> $in
     * @return array{items: list<array{id: int, copies: int, kind: 'item'|'custom'}>, lang: 'en'|'dv', layout: string, w: ?float, h: ?float, fill: bool, mfg: ?string, exp: ?string, batch: string, qty: string, pi: ?int}
     */
    public static function normalise(array $in, ?CarbonImmutable $today = null): array
    {
        $today ??= CarbonImmutable::today();
        $layout = (string) ($in['layout'] ?? 'a4-4');
        if (!isset(StickerLayouts::LAYOUTS[$layout])) {
            throw new InvalidArgumentException('Pick a label size.');
        }
        $w = isset($in['w']) && $in['w'] !== '' ? (float) $in['w'] : null;
        $h = isset($in['h']) && $in['h'] !== '' ? (float) $in['h'] : null;
        StickerLayouts::resolve($layout, $w, $h); // throws for a bad custom size

        $items = [];
        foreach (self::parseItems($in['items'] ?? []) as $row) {
            $items[] = $row;
        }
        if ($items === []) {
            throw new InvalidArgumentException('Pick at least one product.');
        }
        $total = array_sum(array_column($items, 'copies'));
        if ($total > self::MAX_STICKERS) {
            throw new InvalidArgumentException('That is ' . $total . ' stickers; print up to ' . self::MAX_STICKERS . ' at a time.');
        }

        $fill = filter_var($in['fill'] ?? false, FILTER_VALIDATE_BOOL);
        $mfg = self::date($in['mfg'] ?? null);
        $exp = self::date($in['exp'] ?? null);
        if ($fill) {
            $mfg ??= $today->toDateString();
            $m = CarbonImmutable::parse($mfg);
            if ($m->greaterThan($today->addDays(7))) {
                throw new InvalidArgumentException('The made-on date is more than a week away. Check the date.');
            }
            if ($exp !== null) {
                $e = CarbonImmutable::parse($exp);
                if ($e->lessThan($m)) {
                    throw new InvalidArgumentException('The expiry date is before the made-on date.');
                }
                if ($e->lessThan($today)) {
                    throw new InvalidArgumentException('The expiry date has already passed.');
                }
            }
        } else {
            $mfg = null;
            $exp = null;
        }

        $batch = mb_substr(trim((string) ($in['batch'] ?? '')), 0, 30);
        $qty = trim((string) ($in['qty'] ?? ''));
        if ($qty !== '' && (!ctype_digit($qty) || (int) $qty < 1 || (int) $qty > 9999)) {
            throw new InvalidArgumentException('The quantity is a number of pieces, 1 to 9999.');
        }
        $promo = self::promoOf($in);
        // A variable run (round 10, 2026-10-13): each row's own details, from the
        // rows themselves or from a sheet link's `runs` (a JSON list aligned with items).
        $runs = $in['runs'] ?? null;
        if (is_string($runs)) {
            $decoded = json_decode($runs, true);
            $runs = is_array($decoded) ? $decoded : null;
        }
        foreach ($items as $i => $row) {
            $run = $row['run'] ?? [];
            if ($run === [] && is_array($runs) && isset($runs[$i]) && is_array($runs[$i])) {
                $run = $runs[$i];
            }
            $items[$i]['run'] = self::cleanRun($run, $fill, $today);
        }

        return [
            'items' => $items,
            'lang' => in_array($in['lang'] ?? 'en', self::LANGS, true) ? (string) ($in['lang'] ?? 'en') : 'en',
            'layout' => $layout,
            'w' => in_array($layout, StickerLayouts::SIZED, true) ? $w : null,
            'h' => in_array($layout, StickerLayouts::SIZED, true) && StickerLayouts::shape($layout) === 'rect' ? $h : null,
            // Rounded corners on a rectangle's cut line (v2 point 2).
            'rounded' => filter_var($in['rounded'] ?? false, FILTER_VALIDATE_BOOL),
            'fill' => $fill,
            'mfg' => $mfg,
            'exp' => $exp,
            'batch' => $batch,
            'qty' => $qty,
            'pi' => isset($in['pi']) && $in['pi'] !== '' ? (int) $in['pi'] : null,
            // Print the whole sheet "as" a label type (v2 point 3); the items' own wording still wins.
            'type' => isset($in['type']) && $in['type'] !== '' ? (int) $in['type'] : null,
            // One footer preset for the whole sheet (owner, 2026-10-12).
            'footer' => isset($in['footer']) && $in['footer'] !== '' ? (int) $in['footer'] : null,
            // The print log's code per product, for the batch QR (BatchLink).
            'codes' => self::parseCodes($in['b'] ?? ''),
            // Packed for (2026-10-12): who the packs are for, and a second line (the delivery, the date).
            'for' => mb_substr(trim((string) ($in['for'] ?? '')), 0, 60),
            'for2' => mb_substr(trim((string) ($in['for2'] ?? '')), 0, 60),
            // A promotion flash (2026-10-12): was → now prices, or a short line.
            'promo' => $promo['kind'],
            'promo_was' => $promo['was'],
            'promo_now' => $promo['now'],
            'promo_text' => $promo['text'],
            // Round C (2026-10-12): "Pack 3 of 40" on each sticker, and a
            // print-ready sheet with crop marks and a bleed (mm, single labels).
            'number' => filter_var($in['number'] ?? false, FILTER_VALIDATE_BOOL),
            'marks' => filter_var($in['marks'] ?? false, FILTER_VALIDATE_BOOL),
            'bleed' => max(0.0, min(5.0, round((float) ($in['bleed'] ?? 0), 1))),
            // Scan to reprint (round 11, 2026-10-13): the code of the pack this
            // print stands in for; the log keeps it, the sticker does not change.
            'reprint' => self::reprintOf($in['reprint'] ?? null),
        ];
    }

    /** A pack code a request says it reprints, upper-cased, or null when it is none. */
    private static function reprintOf(mixed $raw): ?string
    {
        $code = mb_strtoupper(trim((string) $raw));

        return $code !== '' && $code !== BatchLink::PREVIEW && BatchLink::valid($code) ? $code : null;
    }

    /** The promotion flashes a sticker can carry: an old and new price, or a short line of words. */
    public const PROMO_KINDS = ['was_now', 'text'];

    /**
     * The promotion flash a request asks for, checked.
     *
     * @param array<string, mixed> $in
     * @return array{kind: string, was: ?float, now: ?float, text: string}
     */
    public static function promoOf(array $in): array
    {
        $kind = (string) ($in['promo'] ?? '');
        $text = mb_substr(trim((string) ($in['promo_text'] ?? '')), 0, 24);
        $num = fn ($v): ?float => isset($v) && $v !== '' && is_numeric($v) ? round((float) $v, 2) : null;
        $was = $num($in['promo_was'] ?? null);
        $now = $num($in['promo_now'] ?? null);
        if ($kind === '' || !in_array($kind, self::PROMO_KINDS, true)) {
            return ['kind' => '', 'was' => null, 'now' => null, 'text' => ''];
        }
        if ($kind === 'was_now') {
            if ($now === null || $now < 0) {
                throw new InvalidArgumentException('Type the new price for the Was → Now flash.');
            }
            if ($was !== null && $was <= $now) {
                throw new InvalidArgumentException('The old price must be higher than the new one.');
            }

            return ['kind' => 'was_now', 'was' => $was, 'now' => $now, 'text' => ''];
        }
        if ($text === '') {
            throw new InvalidArgumentException('Type the words for the promotion flash.');
        }

        return ['kind' => 'text', 'was' => null, 'now' => null, 'text' => $text];
    }

    /**
     * The flash as the designs draw it: prices worded, or the words upper-cased.
     *
     * @param array<string, mixed> $req
     * @return ?array{kind: string, was: string, now: string, text: string}
     */
    public static function promoFor(array $req): ?array
    {
        $kind = (string) ($req['promo'] ?? '');
        if ($kind === 'was_now' && isset($req['promo_now'])) {
            return [
                'kind' => 'was_now',
                'was' => isset($req['promo_was']) ? 'MVR ' . number_format((float) $req['promo_was'], 2) : '',
                'now' => 'MVR ' . number_format((float) $req['promo_now'], 2),
                'text' => '',
            ];
        }
        if ($kind === 'text' && trim((string) ($req['promo_text'] ?? '')) !== '') {
            return ['kind' => 'text', 'was' => '', 'now' => '', 'text' => mb_strtoupper(trim((string) $req['promo_text']))];
        }

        return null;
    }

    /**
     * "i12:ABCD2345,c7:EFGH6789" (or a key → code array) → the print code
     * per product key, bad ones dropped.
     *
     * @return array<string, string>
     */
    public static function parseCodes(mixed $raw): array
    {
        $out = [];
        $pairs = [];
        if (is_array($raw)) {
            foreach ($raw as $key => $code) {
                $pairs[] = [(string) $key, (string) $code];
            }
        } else {
            foreach (array_filter(explode(',', (string) $raw)) as $part) {
                $pairs[] = array_pad(explode(':', $part, 2), 2, '');
            }
        }
        foreach ($pairs as [$key, $code]) {
            $code = mb_strtoupper(trim($code));
            if (preg_match('/^[icd][a-z0-9]{1,20}$/', $key) === 1 && BatchLink::valid($code)) {
                $out[$key] = $code;
            }
        }

        return $out;
    }

    /** The inverse: the `b` a sheet link carries. */
    public static function codesParam(array $codes): string
    {
        return implode(',', array_map(fn (string $key, string $code) => $key . ':' . $code, array_keys($codes), array_values($codes)));
    }

    /** @var array<int, ?LabelFooter> */
    private array $footers = [];

    /**
     * The footer preset picked for a sticker: the sheet's, else a custom
     * label's own, else its label type's default; null means the standard one.
     *
     * @param array<string, mixed> $req
     * @param array<string, mixed> $w from LabelTypes::forItem()
     */
    private function footerPreset(array $req, Item|CustomLabel $item, array $w): ?LabelFooter
    {
        $id = $req['footer'] ?? null;
        if (!$id && $item instanceof CustomLabel && $item->footer_id) {
            return $item->relationLoaded('footer') ? $item->footer : ($this->footers[(int) $item->footer_id] ??= LabelFooter::query()->find($item->footer_id));
        }
        $id = $id ?: ($w['footer_id'] ?? null);
        if (!$id) {
            return null;
        }

        return $this->footers[(int) $id] ??= LabelFooter::query()->find((int) $id);
    }

    /** The footer a sticker prints when nothing picked one: the one marked standard. */
    private function standardFooter(): ?LabelFooter
    {
        return $this->footers[0] ??= LabelFooter::default();
    }

    /**
     * Everything the sticker view needs.
     *
     * @param array<string, mixed> $req from normalise()
     * @return array<string, mixed>
     */
    public function build(array $req): array
    {
        // The footers read once per sheet, never per process: the router keeps
        // the controller, and this object with it, between requests.
        $this->footers = [];
        $sheet = StickerLayouts::resolve($req['layout'], $req['w'], $req['h'], LabelSettings::precut());
        $dv = $req['lang'] === 'dv';
        $production = $req['pi'] ? KitchenProductionItem::query()->find($req['pi']) : null;
        $products = $this->products($req['items']);
        // Both languages on one sticker: the English layout with the Dhivehi
        // name, ingredients and storage line set beneath their English.
        $common = $this->common() + ['both' => $req['lang'] === 'both'];

        $stickers = [];
        $summary = [];
        // What each SVG picture on the sheet is (round C), for the label
        // printer's rasteriser, which draws a QR or a barcode itself.
        $vectors = [];
        $draw = fn (array $data): array => LabelSpots::strip($this->pieces($sheet, $data, $dv));
        foreach ($req['items'] as $row) {
            $product = $products[self::key($row)] ?? null;
            if ($product === null) {
                continue;
            }
            $rowReq = self::rowRequest($req, $row);
            $data = $this->stickerData($product, $rowReq, $common, $production);
            $vectors += $data['vector'];
            if (!empty($req['number'])) {
                // Pack numbering (round C): each copy its own sticker, "Pack 3 of 40".
                for ($i = 1; $i <= $row['copies']; $i++) {
                    $stickers[] = $draw($data + ['pack_no' => $i, 'pack_of' => (int) $row['copies']]);
                }
            } else {
                $pieces = $draw($data);
                for ($i = 0; $i < $row['copies']; $i++) {
                    $stickers[] = $pieces;
                }
            }
            $summary[] = ['id' => $product->id, 'kind' => $row['kind'], 'name' => $product->name, 'copies' => $row['copies'], 'exp' => $data['exp_iso'], 'mfg' => $data['mfg_iso'], 'batch' => $rowReq['batch'], 'qty' => $rowReq['qty']];
        }

        return [
            'sheet' => self::printReady($sheet, $req),
            'pages' => array_chunk($stickers, $sheet['per_page']),
            'dv' => $dv,
            'summary' => $summary,
            'stickerCount' => count($stickers),
            'rounded' => $sheet['shape'] === 'rect' && $req['rounded'],
            'vectors' => $vectors,
        ];
    }

    /**
     * One sticker's pieces in the sheet's design, with the part markers the
     * designs put in for the preview's touch zones (LabelSpots): strip them
     * before anything draws.
     *
     * @param array<string, mixed> $sheet from StickerLayouts::resolve()
     * @param array<string, mixed> $data from stickerData()
     * @return list<array<string, mixed>>
     */
    private function pieces(array $sheet, array $data, bool $dv): array
    {
        $pieces = match ($sheet['design']) {
            'full' => StickerDesign::full($data, $dv),
            'round' => StickerDesign::round($data, $dv, $sheet['w']),
            'small' => SmallStickerDesign::rect($data, $dv, $sheet['w'], $sheet['h']),
            'wrap' => WrapDesign::wrap($data, $dv, $sheet['w'], $sheet['h']),
            default => StickerDesign::mini($data, $dv, $sheet['w'], $sheet['h']),
        };

        // The parts moved or resized by hand on this design (the drag designer, round 8, 2026-10-13).
        return LabelLayout::apply($pieces, $data['layout'][$sheet['design']] ?? []);
    }

    /**
     * A print-ready sheet (round C): crop marks at every label's corners,
     * and on a one-label page a bleed around the label (the page grows by
     * it on each side; the sticker's ground is white, so the bleed is
     * white). The dashed cut lines go when the marks come.
     *
     * @param array<string, mixed> $sheet from StickerLayouts::resolve()
     * @param array<string, mixed> $req
     * @return array<string, mixed>
     */
    public static function printReady(array $sheet, array $req): array
    {
        $marks = !empty($req['marks']);
        $bleed = $marks && $sheet['per_page'] === 1 ? (float) ($req['bleed'] ?? 0) : 0.0;
        if ($bleed > 0) {
            $sheet['page_w'] = round($sheet['page_w'] + 2 * $bleed, 2);
            $sheet['page_h'] = round($sheet['page_h'] + 2 * $bleed, 2);
            $sheet['slots'] = array_map(fn (array $s) => ['x' => round($s['x'] + $bleed, 3), 'y' => round($s['y'] + $bleed, 3)] + $s, $sheet['slots']);
        }
        $sheet['marks'] = $marks;
        $sheet['bleed'] = $bleed;
        if ($marks) {
            $sheet['cut'] = false;
        }

        return $sheet;
    }

    /**
     * The menu items and custom labels a request names, keyed "i12" / "c5";
     * a draft custom label ("d" + its cache token) is built from the cache.
     *
     * @param list<array{id: int|string, copies: int, kind: string}> $rows
     * @return array<string, Item|CustomLabel>
     */
    public function products(array $rows): array
    {
        $ids = ['item' => [], 'custom' => [], 'draft' => []];
        foreach ($rows as $row) {
            $ids[$row['kind']][] = $row['id'];
        }
        $out = [];
        foreach ($ids['draft'] as $token) {
            $draft = self::draft((string) $token);
            if ($draft !== null) {
                $out['d' . $token] = $draft;
            }
        }
        if ($ids['item'] !== []) {
            foreach (Item::query()->with('labelType.brand')->whereIn('id', $ids['item'])->get() as $item) {
                $out['i' . $item->id] = $item;
            }
        }
        if ($ids['custom'] !== []) {
            foreach (CustomLabel::query()->with(['labelType.brand', 'brand', 'footer'])->whereIn('id', $ids['custom'])->get() as $custom) {
                $out['c' . $custom->id] = $custom;
            }
        }

        return $out;
    }

    /** @param array{id: int|string, kind: string} $row */
    public static function key(array $row): string
    {
        return (['custom' => 'c', 'draft' => 'd'][$row['kind']] ?? 'i') . $row['id'];
    }

    /**
     * Keep a custom label that is still being written, so the editor can
     * show it before it is saved (2026-10-12). Returns the token the sheet
     * link names it by.
     *
     * @param array<string, mixed> $attributes the custom label's columns
     */
    public static function keepDraft(array $attributes): string
    {
        $token = bin2hex(random_bytes(8));
        Cache::put(self::DRAFT_CACHE . $token, $attributes, now()->addMinutes(self::DRAFT_MINUTES));

        return $token;
    }

    /** The draft behind a token as an unsaved custom label, with its brand and type. */
    public static function draft(string $token): ?CustomLabel
    {
        if (!preg_match('/^[a-f0-9]{16}$/', $token)) {
            return null;
        }
        $attributes = Cache::get(self::DRAFT_CACHE . $token);
        if (!is_array($attributes)) {
            return null;
        }
        $draft = new CustomLabel;
        $draft->forceFill(array_intersect_key($attributes, array_flip($draft->getFillable())));
        $draft->setRelation('brand', $draft->brand_id ? LabelBrand::query()->find($draft->brand_id) : null);
        $draft->setRelation('labelType', $draft->label_type_id ? LabelType::query()->with('brand')->find($draft->label_type_id) : null);
        $draft->setRelation('footer', $draft->footer_id ? LabelFooter::query()->find($draft->footer_id) : null);

        return $draft;
    }

    /**
     * What a request will print, without drawing it: per product the copies
     * and the dates that will go on it, and the sheet count.
     *
     * @param array<string, mixed> $req from normalise()
     * @return array{layout: string, label: string, design: string, stickers: int, pages: int, per_page: int, products: list<array{id: int, name: string, copies: int, mfg: ?string, exp: ?string, shelf_life_days: ?int, ingredients_from: string}>}
     */
    public function summary(array $req): array
    {
        $sheet = StickerLayouts::resolve($req['layout'], $req['w'], $req['h'], LabelSettings::precut());
        $production = $req['pi'] ? KitchenProductionItem::query()->find($req['pi']) : null;
        $found = $this->products($req['items']);
        $products = [];
        $total = 0;
        foreach ($req['items'] as $row) {
            $product = $found[self::key($row)] ?? null;
            if ($product === null) {
                continue;
            }
            $rowReq = self::rowRequest($req, $row);
            [$mfg, $exp] = $this->dates($product, $rowReq, $production);
            $products[] = [
                'id' => $product->id,
                'kind' => $row['kind'],
                'key' => self::key($row),
                'name' => $product->name,
                'copies' => $row['copies'],
                'mfg' => $mfg,
                'exp' => $exp,
                'shelf_life_days' => $product->label_shelf_life_days,
                'ingredients_from' => $this->ingredientLines($product)['from'],
                // A variable run (round 10): what this row prints with, where it differs from the sheet.
                'batch' => $rowReq['batch'],
                'qty' => $rowReq['qty'] !== '' ? (int) $rowReq['qty'] : null,
                'for' => $rowReq['for'],
                'for2' => $rowReq['for2'],
                'varied' => ($row['run'] ?? []) !== [],
            ];
            $total += $row['copies'];
        }

        $summary = [
            'layout' => $sheet['key'],
            'label' => $sheet['label'],
            'design' => $sheet['design'],
            'shape' => $sheet['shape'],
            'w' => $sheet['w'],
            'h' => $sheet['h'],
            'stickers' => $total,
            'pages' => (int) ceil($total / max(1, $sheet['per_page'])),
            'per_page' => $sheet['per_page'],
            'products' => $products,
        ];
        // Where the first product's parts land (rounds 2 and 3 of the usability
        // work, 2026-10-13), so the Admin can lay touch zones over the preview:
        // a wrap-around label says where its strips are, every other design
        // where each part is (LabelSpots), from the same layout the sheet draws.
        if ($products !== []) {
            $first = $found[$products[0]['key']];
            $dv = $req['lang'] === 'dv';
            $data = $this->stickerData($first, self::rowRequest($req, $req['items'][0]), $this->common() + ['both' => $req['lang'] === 'both'], $production);
            if ($sheet['design'] === 'wrap') {
                $summary['wrap'] = WrapDesign::strips($data, $dv, (float) $sheet['w'], (float) $sheet['h']);
            }
            $summary['spots'] = LabelSpots::spots($this->pieces($sheet, $data, $dv));
        }

        return $summary;
    }

    /**
     * Made-on and expiry for one product: the expiry asked for, else the
     * production batch's own, else made-on plus the product's shelf life.
     *
     * @param array<string, mixed> $req
     * @return array{0: ?string, 1: ?string}
     */
    public function dates(Item|CustomLabel $item, array $req, ?KitchenProductionItem $production = null): array
    {
        if (!$req['fill']) {
            return [null, null];
        }
        $mfg = $req['mfg'];
        if ($req['exp']) {
            return [$mfg, $req['exp']];
        }
        if ($item instanceof Item && $production && $production->expires_at && (int) $production->item_id === (int) $item->id) {
            return [$mfg, CarbonImmutable::parse($production->expires_at)->toDateString()];
        }
        $life = $this->types->forItem($item, $this->asType($req))['shelf_life_days'];
        if ($life) {
            return [$mfg, CarbonImmutable::parse($mfg)->addDays((int) $life)->toDateString()];
        }

        return [$mfg, null];
    }

    /**
     * One product's sticker content.
     *
     * @param array<string, mixed> $req
     * @param array<string, mixed> $common
     * @return array<string, mixed>
     */
    public function stickerData(Item|CustomLabel $item, array $req, array $common, ?KitchenProductionItem $production = null): array
    {
        $lines = $this->ingredientLines($item);
        $title = LabelImage::fromMedia($item->label_title_media_id, 900);
        $photo = LabelImage::fromMedia($item->label_photo_media_id, 900)
            ?? ($item instanceof Item ? LabelImage::fromPublicUrl($item->cutout_url, 900) : null);

        [$mfg, $exp] = $this->dates($item, $req, $production);
        $batch = $req['batch'];
        if ($batch === '' && $item instanceof Item && $production && (int) $production->item_id === (int) $item->id) {
            $batch = (string) ($production->batch_code ?? '');
        }
        $qty = $req['qty'] !== '' ? $req['qty'] : ($item->label_pack_qty ? (string) $item->label_pack_qty : '');
        $w = $this->types->forItem($item, $this->asType($req));
        // 2026-10-12: a price (the menu's unless typed, and only when switched
        // on for a menu item), a barcode, a net weight and the allergens.
        $price = $this->price($item);
        // A was → now flash (2026-10-12) makes the new price the one on the quantity line.
        $promo = self::promoFor($req);
        if ($promo !== null && $promo['kind'] === 'was_now') {
            $price = $promo['now'];
        }
        $code = Barcode::normalise($item->label_barcode);
        $allergens = self::allergens($item);
        $note = $w['note'];
        if ($note === '' && $allergens !== []) {
            $note = 'Contains ' . implode(', ', $allergens);
        }
        // The footer (owner, 2026-10-12), always the business's branding: a
        // preset picked for the sheet, the label or its type, else the
        // standard one; the complaints QR follows the custom label's own
        // switch, else the picked footer's, else the type's.
        $explicit = $this->footerPreset($req, $item, $w);
        $footer = $this->types->footer($explicit ?? $this->standardFooter(), $w['show_qr'], implicit: $explicit === null);
        $showQr = $item instanceof CustomLabel && $item->label_show_qr !== null ? (bool) $item->label_show_qr : $footer['show_qr'];
        // 2026-10-12: the print's code as a QR in the header (the pack's
        // page), and allergen pictograms above the note; each behind a
        // switch on Labels → Settings. A draft custom label has no code.
        $key = $item instanceof CustomLabel ? ($item->exists ? 'c' . $item->id : null) : 'i' . $item->id;
        $printCode = $key !== null ? ($req['codes'][$key] ?? null) : null;
        $spicy = $item instanceof Item && in_array((string) $item->spice_level, AllergenIcons::SPICY_LEVELS, true);

        $batchQr = $printCode !== null && LabelSettings::on('label_batch_qr') ? BatchLink::qr($printCode) : null;
        $icons = LabelSettings::on('label_allergen_icons') ? AllergenIcons::for($allergens, $spicy) : [];
        // What each SVG picture on the sticker is (round C): the thermal
        // rasteriser draws a QR or a barcode itself, since GD reads no SVG.
        $vector = [];
        if ($common['qr'] ?? null) {
            $vector[$common['qr']] = ['qr', ComplaintBoxLink::url('label')];
        }
        if ($common['qr_branded'] ?? null) {
            $vector[$common['qr_branded']] = ['qr', ComplaintBoxLink::url('label')];
        }
        if ($batchQr !== null) {
            $vector[$batchQr] = ['qr', BatchLink::url($printCode)];
        }
        if ($code !== null) {
            $vector[Barcode::svgDataUri($code)] = ['ean', $code];
        }
        foreach ($icons as $icon) {
            $vector[$icon['src']] = ['icon', $icon['key']];
        }
        // A wrap-around label's parts (owner, 2026-10-12): what prints, the
        // recycling marks, the pictures picked for the marks row, and who
        // made it for the legal text.
        $wrap = WrapConfig::of($item);
        $pictures = [];
        foreach ($wrap['pictures'] as $mediaId) {
            $src = LabelImage::fromMedia($mediaId, 400);
            if ($src !== null) {
                $pictures[] = ['src' => $src, 'ratio' => LabelImage::ratio($src)];
            }
        }
        $contact = $common['contact'];

        return $common + [
            'wrap' => $wrap,
            // The parts moved or resized by hand, per design (round 8).
            'layout' => LabelLayout::of($item),
            // Badges (round 9): rust pills under the name.
            'badges' => LabelBadges::for($item),
            'marks' => LabelMarks::for($wrap['marks']),
            'pictures' => $pictures,
            'producer' => ['name' => (string) ($contact['name'] ?? ''), 'address' => (string) ($contact['address'] ?? ''), 'phone' => (string) ($contact['phone'] ?? ''), 'website' => (string) ($contact['website'] ?? '')],
            // Packed for and the promotion flash (2026-10-12), from the request.
            'packed_for' => (string) ($req['for'] ?? ''),
            'packed_for2' => (string) ($req['for2'] ?? ''),
            'promo' => $promo,
            'print_code' => $printCode ?? '',
            'batch_qr' => $batchQr,
            'icons' => $icons,
            'vector' => $vector,
            // The nutrition panel (round C): the recipe's per 100 g when the item prints it, a custom label's typed line.
            'nutrition' => $this->nutrition->forSticker($item),
            'name' => (string) $item->name,
            'name_dv' => trim((string) $item->name_dv),
            'title_img' => $title,
            'title_ratio' => LabelImage::ratio($title),
            'photo' => $photo,
            'photo_ratio' => LabelImage::ratio($photo),
            'ingredients_en' => $lines['en'],
            'ingredients_dv' => $lines['dv'],
            'mfg' => LabelSettings::formatDate($mfg),
            'exp' => LabelSettings::formatDate($exp),
            'mfg_iso' => $mfg,
            'exp_iso' => $exp,
            'batch' => $batch,
            'qty' => $qty,
            'unit' => trim((string) $item->label_pack_unit) !== '' ? mb_strtoupper(trim((string) $item->label_pack_unit)) : 'PCS',
            // Wording from the item, its label type, or the per-storage defaults (LabelTypes).
            'header_line' => $w['heading'],
            'header_line_dv' => $w['heading_dv'],
            'storage_en' => $w['storage_en'],
            'storage_dv' => $w['storage_dv'],
            'note' => $note,
            'note_dv' => $w['note_dv'],
            'footer' => $footer,
            'price' => $price,
            'net_weight' => trim((string) $item->label_net_weight),
            'barcode' => $code !== null ? Barcode::svgDataUri($code) : null,
            'barcode_text' => $code !== null ? Barcode::text($code) : '',
            'allergens' => $allergens,
            'how_to_use' => $w['how_to_use'],
            'how_to_use_dv' => $w['how_to_use_dv'],
            'use_within' => $w['use_within'],
            'use_within_dv' => $w['use_within_dv'],
            'mfg_label' => $w['mfg_label'],
            'exp_label' => $w['exp_label'],
            'show_qr' => $showQr,
            'brand' => $w['brand'],
            'type_name' => $w['type_name'],
        ];
    }

    /** "MVR 25.00", or '' when nothing is to print. */
    public function price(Item|CustomLabel $item): string
    {
        if ($item instanceof CustomLabel) {
            $amount = $item->label_price !== null ? (float) $item->label_price : null;
        } elseif ($item->label_show_price) {
            $amount = $item->label_price !== null ? (float) $item->label_price : $item->displayPriceInfo()['price'];
        } else {
            $amount = null;
        }

        return $amount !== null && $amount > 0 ? 'MVR ' . number_format($amount, 2) : '';
    }

    /**
     * The allergens to set bold in the ingredients: a menu item's from its
     * Details tab ("egg", "tree-nuts" → "tree nuts"), a custom label's as typed.
     *
     * @return list<string>
     */
    public static function allergens(Item|CustomLabel $item): array
    {
        $raw = $item instanceof CustomLabel
            ? preg_split('/\s*,\s*/u', trim((string) $item->label_allergens)) ?: []
            : (is_array($item->allergens) ? $item->allergens : []);
        $out = [];
        foreach ($raw as $a) {
            $a = mb_strtolower(trim(str_replace(['-', '_'], ' ', (string) $a)));
            if ($a !== '' && !in_array($a, $out, true)) {
                $out[] = $a;
            }
        }

        return $out;
    }

    /**
     * The ingredient line: an item's from its recipe or typed in
     * (LabelIngredients), a custom label's as typed.
     *
     * @return array{en: string, dv: string, from: string}
     */
    public function ingredientLines(Item|CustomLabel $product): array
    {
        if ($product instanceof Item) {
            return $this->ingredients->forItem($product);
        }
        $en = trim((string) $product->label_ingredients);
        $dv = trim((string) $product->label_ingredients_dv);
        $dvFrom = $dv !== '' ? 'typed' : '';
        // No Dhivehi typed: the glossary translates the English list (2026-10-12).
        if ($dv === '' && $en !== '') {
            $dv = LabelIngredients::translate($en)['dv'];
            $dvFrom = $dv !== '' ? 'glossary' : '';
        }

        return ['en' => $en, 'dv' => $dv, 'from' => $en !== '' || $dv !== '' ? 'manual' : 'none', 'dv_from' => $dvFrom, 'recipe_en' => '', 'recipe_dv' => ''];
    }

    /** @return array<string, mixed> What every sticker on the sheet shares. */
    public function common(): array
    {
        $logo = LabelImage::fromPublic('brand/logo-light.png', 500);
        $mark = LabelImage::fromPublic('brand/logo-mark.png', 300);
        // The logo with cream lettering, for the footer's "logo" look on the dark band.
        $wordmark = LabelImage::fromPublic('brand/logo-dark.png', 500);

        return [
            'logo' => $logo,
            'logo_ratio' => LabelImage::ratio($logo),
            'mark' => $mark,
            'mark_ratio' => LabelImage::ratio($mark),
            'wordmark' => $wordmark,
            'wordmark_ratio' => LabelImage::ratio($wordmark),
            'contact' => LabelSettings::contact(),
            // v2 point 1: the complaints QR, the same code as the receipts and
            // the poster, bare (no logo: it prints at 8 to 12 mm) — and with
            // the brand mark inside for the full sticker, whose 11.5 mm code
            // has room for it (owner, 2026-10-12: "complaint qr with its
            // branding"; the mark is kept small so a phone still reads it).
            'qr' => QrSvg::dataUri(ComplaintBoxLink::url('label'), 160),
            'qr_branded' => ComplaintBoxLink::qr(ComplaintBoxLink::url('label'), 240, self::QR_LOGO_RATIO),
            'brand_line_dv' => LabelSettings::get('label_brand_line_dv'),
            'ways' => LabelSettings::get('label_contact_ways'),
            'ways_dv' => LabelSettings::get('label_contact_ways_dv'),
            'address_dv' => LabelSettings::get('label_address_dv'),
            'landmark_dv' => LabelSettings::get('label_landmark_dv'),
        ];
    }

    /**
     * "12:8,c5:3" or [{id, copies, kind}] → [{id, copies, kind}], merged per
     * product. A "c" before the id (or kind "custom") is a custom label.
     *
     * @return list<array{id: int, copies: int, kind: 'item'|'custom'}>
     */
    public static function parseItems(mixed $raw): array
    {
        $rows = [];
        if (is_string($raw)) {
            foreach (array_filter(explode(',', $raw)) as $part) {
                [$id, $copies] = array_pad(explode(':', $part, 2), 2, '0');
                if (str_starts_with($id, 'd')) {
                    // A draft custom label, by its cache token (previews only).
                    $rows[] = ['id' => substr($id, 1), 'copies' => (int) $copies, 'kind' => 'draft'];
                    continue;
                }
                $custom = str_starts_with($id, 'c');
                $rows[] = ['id' => (int) ltrim($id, 'c'), 'copies' => (int) $copies, 'kind' => $custom ? 'custom' : 'item'];
            }
        } elseif (is_array($raw)) {
            foreach ($raw as $row) {
                if (is_array($row)) {
                    // A variable run (round 10, 2026-10-13): a row's own batch, quantity, dates and packed-for.
                    $run = [];
                    foreach (self::RUN_KEYS as $k) {
                        if (isset($row[$k]) && trim((string) $row[$k]) !== '') {
                            $run[$k] = trim((string) $row[$k]);
                        }
                    }
                    $rows[] = ['id' => (int) ($row['id'] ?? 0), 'copies' => (int) ($row['copies'] ?? 0), 'kind' => ($row['kind'] ?? 'item') === 'custom' ? 'custom' : 'item', 'run' => $run];
                }
            }
        }
        $merged = [];
        foreach ($rows as $row) {
            if ((is_string($row['id']) ? $row['id'] !== '' : $row['id'] > 0) && $row['copies'] > 0) {
                $key = self::key($row);
                $merged[$key] ??= ['id' => $row['id'], 'copies' => 0, 'kind' => $row['kind'], 'run' => $row['run'] ?? []];
                $merged[$key]['copies'] += min($row['copies'], self::MAX_STICKERS);
            }
        }

        return array_values($merged);
    }

    /** What a row of a variable run may set for itself (round 10): the sheet's value otherwise. */
    public const RUN_KEYS = ['batch', 'qty', 'mfg', 'exp', 'for', 'for2'];

    /**
     * A row's own details, checked as the sheet's are: the batch to 30
     * characters, the quantity 1 to 9999, the dates real and in order (and
     * dropped when the dates are not filled in), packed-for to 60. Only
     * what is set is kept.
     *
     * @param array<string, mixed> $run
     * @return array<string, string>
     */
    private static function cleanRun(array $run, bool $fill, CarbonImmutable $today): array
    {
        $out = [];
        $batch = mb_substr(trim((string) ($run['batch'] ?? '')), 0, 30);
        if ($batch !== '') {
            $out['batch'] = $batch;
        }
        $qty = trim((string) ($run['qty'] ?? ''));
        if ($qty !== '') {
            if (!ctype_digit($qty) || (int) $qty < 1 || (int) $qty > 9999) {
                throw new InvalidArgumentException('A quantity is a number of pieces, 1 to 9999.');
            }
            $out['qty'] = $qty;
        }
        if ($fill) {
            $mfg = self::date($run['mfg'] ?? null);
            $exp = self::date($run['exp'] ?? null);
            if ($mfg !== null && CarbonImmutable::parse($mfg)->greaterThan($today->addDays(7))) {
                throw new InvalidArgumentException('A made-on date is more than a week away. Check the dates.');
            }
            if ($exp !== null) {
                $e = CarbonImmutable::parse($exp);
                if ($mfg !== null && $e->lessThan(CarbonImmutable::parse($mfg))) {
                    throw new InvalidArgumentException('An expiry date is before its made-on date.');
                }
                if ($e->lessThan($today)) {
                    throw new InvalidArgumentException('An expiry date has already passed.');
                }
            }
            if ($mfg !== null) {
                $out['mfg'] = $mfg;
            }
            if ($exp !== null) {
                $out['exp'] = $exp;
            }
        }
        foreach (['for', 'for2'] as $k) {
            $v = mb_substr(trim((string) ($run[$k] ?? '')), 0, 60);
            if ($v !== '') {
                $out[$k] = $v;
            }
        }

        return $out;
    }

    /**
     * The rows' own details as a sheet link carries them (`runs`): a JSON
     * list aligned with `items`, or null when no row has any.
     *
     * @param list<array{run?: array<string, string>}> $items
     */
    public static function runsParam(array $items): ?string
    {
        $runs = array_map(fn (array $r) => $r['run'] ?? [], $items);
        if (array_filter($runs) === []) {
            return null;
        }

        return (string) json_encode(array_map(fn (array $r) => (object) $r, $runs), JSON_UNESCAPED_UNICODE);
    }

    /**
     * The request a row prints with: the sheet's, with the row's own details over it.
     *
     * @param array<string, mixed> $req
     * @param array{run?: array<string, string>} $row
     * @return array<string, mixed>
     */
    public static function rowRequest(array $req, array $row): array
    {
        $run = $row['run'] ?? [];
        if ($run === []) {
            return $req;
        }
        $out = $req;
        foreach ($run as $k => $v) {
            $out[$k] = $v;
        }
        // A row's own made-on date without an expiry: the expiry follows from the shelf life again.
        if (isset($run['mfg']) && !isset($run['exp'])) {
            $out['exp'] = null;
        }

        return $out;
    }

    /**
     * The same, keeping a zero count (a box label line whose quantity is
     * written in by hand).
     *
     * @return list<array{id: int, copies: int}>
     */
    public static function parseItemsAllowZero(mixed $raw): array
    {
        $rows = [];
        if (is_string($raw)) {
            foreach (array_filter(explode(',', $raw)) as $part) {
                [$id, $n] = array_pad(explode(':', $part, 2), 2, '0');
                $rows[] = ['id' => (int) $id, 'copies' => max(0, (int) $n)];
            }
        } elseif (is_array($raw)) {
            foreach ($raw as $row) {
                if (is_array($row)) {
                    $rows[] = ['id' => (int) ($row['id'] ?? 0), 'copies' => max(0, (int) ($row['qty'] ?? $row['copies'] ?? 0))];
                }
            }
        }

        return array_values(array_filter($rows, fn ($r) => $r['id'] > 0));
    }

    /** @param list<array{id: int, copies: int, kind?: string}> $items */
    public static function itemsParam(array $items): string
    {
        return implode(',', array_map(fn ($r) => (($r['kind'] ?? 'item') === 'custom' ? 'c' : '') . $r['id'] . ':' . $r['copies'], $items));
    }

    private static function date(mixed $value): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            throw new InvalidArgumentException('Dates are written as YYYY-MM-DD.');
        }
        try {
            return CarbonImmutable::createFromFormat('!Y-m-d', $value)->toDateString();
        } catch (\Throwable) {
            throw new InvalidArgumentException('That is not a real date.');
        }
    }
}
