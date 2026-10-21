<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Models\Item;
use RuntimeException;
use Throwable;

/**
 * The piece list of a poster drawn on a ready-made design
 * (docs/POSTER_THEMES_HANDOFF.md). The variant comes from the paper size,
 * every coordinate is mapped from design units to page millimetres with
 * the § 1 formula, and the pieces come out in the design's draw order: the
 * backdrop (with the photo slots where its draw list marks them), the logo
 * on its cream badge, the QR when the design has one, and the text slots.
 * A slot's words are the poster's (`slots[tN]`), else the live price for
 * the first price slot when a dish or an offer is bound, else the design's
 * own. Edited text shrinks to its slot's width, never below the variant's
 * floor; what still does not fit raises the overflow flag.
 *
 * Nothing here falls back to a layout: a poster with no theme, or one the
 * catalogue does not know, throws.
 */
final class PosterThemePieces
{
    /** A slot narrower than this (design units) takes a dish's cut-out rather than its photo. */
    public const CUTOUT_UNDER_UNITS = 120.0;

    /** Thaana in a slot sets in Noto Sans Thaana; these Latin faces take its bold. */
    private const BOLD_FACES = ['anton', 'j7', 'j8', 'fri7', 'fri9'];

    /**
     * @param array<string, mixed> $poster
     * @param array<string, mixed> $content from PosterContent::resolve()
     * @return array<string, mixed>
     */
    public static function build(array $poster, PaperSize $size, array $content): array
    {
        $key = (string) ($poster['theme'] ?? '');
        $theme = $key !== '' ? PosterThemes::get($key) : null;
        if ($theme === null) {
            throw new RuntimeException('A template poster needs a template.');
        }
        $variant = PosterThemes::variantFor($theme, $size);
        $variantName = (string) $variant['variant'];
        $map = PosterThemes::mapping($variant, $size);
        $slots = is_array($poster['slots'] ?? null) ? $poster['slots'] : [];
        $flags = ['overflow' => false, 'shrunk' => false, 'missing_dv' => false];
        $pageW = $size->bleedWidth();
        $pageH = $size->bleedHeight();

        $items = [];
        $background = null;
        $hexBg = null;
        foreach (PosterThemes::drawList($theme, $variantName) as $item) {
            if (isset($item['photo_slot'])) {
                $items[] = ['photo_slot' => (string) $item['photo_slot']];

                continue;
            }
            $mapped = self::mapItem($map, $item);
            if ($background === null) {
                // The first flat area the design lays down is the page's colour under everything.
                if ($mapped['fill'] !== null) {
                    $background = $mapped['fill'];
                    $hexBg = $mapped['hex'] ?? '#FFFFFF';
                } elseif (is_array($mapped['gradient'] ?? null)) {
                    $background = $mapped['gradient']['stops'][0][1];
                    $hexBg = (string) $mapped['gradient']['hex_stops'][0][1];
                }
            }
            $items[] = $mapped;
        }
        $pieces = [[
            'type' => 'backdrop', 'x' => 0.0, 'y' => 0.0, 'w' => $pageW, 'h' => $pageH, 'bleed' => true, 'items' => $items,
        ]];

        $boundItem = self::boundItem($content, $poster);
        $first = true;
        foreach ($variant['photo_slots'] as $slot) {
            $pieces[] = self::photoPiece($map, $slot, $slots[(string) $slot['id']] ?? null, $first ? $boundItem : null, $content, $theme, $variantName);
            $first = false;
        }

        $pieces[] = self::logoPiece($map, $variant['logo']);
        if (is_array($variant['qr'] ?? null)) {
            $pieces[] = self::qrPiece($map, $variant['qr'], (string) ($content['qr_url'] ?? ''));
        }

        $floorPt = PosterThemes::mapPoints($map, (float) $variant['canvas']['min_text_units']);
        $priceFilled = false;
        foreach ($variant['text_slots'] as $slot) {
            $piece = self::textPiece($map, $slot, $slots[(string) $slot['id']] ?? null, $content, $floorPt, $priceFilled, $flags);
            if ($piece !== null) {
                $pieces[] = $piece;
            }
        }

        $inset = PosterThemes::mapLength($map, (float) $variant['canvas']['safe_inset_units'] - (float) $variant['canvas']['bleed_units']);
        $safe = [$size->bleed + $inset, $size->bleed + $map['dy'] + $inset, $size->trimWidth - 2 * $inset, $size->trimHeight - 2 * $inset];
        $photoOrder = PosterThemes::photoOrder($theme, $variantName);

        return [
            'w' => $pageW,
            'h' => $pageH,
            'background' => $background ?? BrandCmyk::PAPER_WHITE,
            'hex_bg' => $hexBg ?? '#FFFFFF',
            'pieces' => $pieces,
            'flags' => $flags,
            'theme' => [
                'key' => (string) $theme['key'],
                'id' => (string) $theme['id'],
                'title' => (string) $theme['title'],
                'variant' => $variantName,
                'size' => $size->name,
                'map' => $map,
                'canvas' => [(float) $variant['canvas']['width'], (float) $variant['canvas']['height']],
                'safe' => $safe,
                'min_pt' => $floorPt,
                'keepout' => $variantName === 'large',
                // The preview stacks the backdrop's layers with a photo between each pair (PosterThemes::backdropLayer).
                'photo_order' => $photoOrder,
                'layers' => count($photoOrder) + 1,
            ],
        ];
    }

    /**
     * One draw-list item in page millimetres and press ink.
     *
     * @param array{s: float, dy: float, bleed_units: float, ox: float, oy: float} $map
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private static function mapItem(array $map, array $item): array
    {
        $out = [
            'ops' => PosterThemes::mapOps($map, is_array($item['ops'] ?? null) ? $item['ops'] : []),
            'rule' => ($item['rule'] ?? 'nonzero') === 'evenodd' ? 'evenodd' : 'nonzero',
            'opacity' => max(0.0, min(1.0, (float) ($item['opacity'] ?? 1.0))),
            'fill' => null,
        ];
        $fill = $item['fill'] ?? null;
        if (is_array($fill) && is_array($fill['gradient'] ?? null)) {
            $g = $fill['gradient'];
            $stops = [];
            foreach ($g['stops'] ?? [] as $stop) {
                $stops[] = [(float) $stop[0], BrandCmyk::forHex((string) $stop[1])];
            }
            $out['gradient'] = [
                'type' => ($g['type'] ?? 'linear') === 'radial' ? 'radial' : 'linear',
                'coords' => array_map('floatval', is_array($g['coords'] ?? null) ? $g['coords'] : [0, 0, 1, 0]),
                'stops' => $stops,
                'hex_stops' => $g['stops'] ?? [],
            ];
            $bbox = is_array($item['bbox'] ?? null) && count($item['bbox']) === 4 ? $item['bbox'] : null;
            if ($bbox === null) {
                [$x0, $y0, $x1, $y1] = SvgPath::bounds(is_array($item['ops'] ?? null) ? $item['ops'] : []);
                $bbox = [$x0, $y0, $x1 - $x0, $y1 - $y0];
            }
            $out['bbox'] = PosterThemes::mapBox($map, $bbox);
        } elseif (is_string($fill) && $fill !== '') {
            $out['fill'] = BrandCmyk::forHex($fill);
            $out['hex'] = strtoupper($fill);
        }
        if (is_array($item['stroke'] ?? null)) {
            $s = $item['stroke'];
            $dash = null;
            if (is_string($s['dash'] ?? null) && trim($s['dash']) !== '') {
                $dash = array_map(static fn (string $d): float => PosterThemes::mapLength($map, (float) $d), preg_split('/[\s,]+/', trim($s['dash'])) ?: []);
            }
            $out['stroke'] = [
                'cmyk' => BrandCmyk::forHex((string) ($s['colour'] ?? '#000000')),
                'hex' => strtoupper((string) ($s['colour'] ?? '#000000')),
                'width' => PosterThemes::mapLength($map, (float) ($s['width_mm'] ?? 0.5)),
                'dash' => $dash,
                'cap' => (string) ($s['cap'] ?? 'butt'),
            ];
        }
        if (is_array($item['clip_rect'] ?? null) && count($item['clip_rect']) === 4) {
            $out['clip_rect'] = PosterThemes::mapBox($map, $item['clip_rect']);
        }

        return $out;
    }

    /**
     * A photo slot: the chosen picture (a dish's photo or cut-out, an upload,
     * else the poster's bound dish for the first slot, else the design's
     * placeholder), its clip in page millimetres, and how it sits.
     *
     * @param array{s: float, dy: float, bleed_units: float, ox: float, oy: float} $map
     * @param array<string, mixed> $slot
     * @param array<string, mixed> $content
     * @param array<string, mixed> $theme
     * @return array<string, mixed>
     */
    private static function photoPiece(array $map, array $slot, mixed $choice, ?Item $boundItem, array $content, array $theme, string $variantName): array
    {
        $box = PosterThemes::mapBox($map, $slot['box']);
        $clipOps = PosterThemes::mapOps($map, $slot['clip_ops']);
        $centre = is_array($slot['rotation_centre'] ?? null)
            ? PosterThemes::mapPoint($map, (float) $slot['rotation_centre'][0], (float) $slot['rotation_centre'][1])
            : [$box[0] + $box[2] / 2, $box[1] + $box[3] / 2];
        $small = min((float) $slot['box'][2], (float) $slot['box'][3]) < self::CUTOUT_UNDER_UNITS;

        $picked = self::pickPhoto(is_array($choice) ? $choice : [], $boundItem, $small, $content);
        if ($picked['path'] === null) {
            $placeholder = PosterThemes::root() . '/' . $theme['path'] . '/' . $slot['placeholder_image'];
            $picked = ['path' => is_file($placeholder) ? $placeholder : null, 'source' => 'placeholder', 'item_id' => null, 'photo_path' => null, 'url' => null];
        }

        return [
            'type' => 'photo',
            'slot' => (string) $slot['id'],
            'x' => $box[0], 'y' => $box[1], 'w' => $box[2], 'h' => $box[3],
            'path' => $picked['path'],
            'source' => $picked['source'],
            'item_id' => $picked['item_id'],
            'photo_path' => $picked['photo_path'],
            'url' => $picked['url'],
            'placeholder_image' => (string) $slot['placeholder_image'],
            'shape' => (string) ($slot['shape'] ?? 'rect'),
            'clip_ops' => $clipOps,
            'clip_d' => self::pathD($clipOps),
            'rotation' => (float) ($slot['rotation_deg'] ?? 0.0),
            'centre' => $centre,
            'contain' => $picked['source'] === 'cutout',
            'fill_behind' => BrandCmyk::forHex((string) $slot['fill_behind']),
            'hex_behind' => strtoupper((string) $slot['fill_behind']),
            'min_px' => is_array($slot['min_px_for_150ppi'] ?? null) ? array_map('intval', $slot['min_px_for_150ppi']) : null,
            'bleed' => $box[0] <= 0.01 || $box[1] <= 0.01,
            'variant' => $variantName,
        ];
    }

    /**
     * @param array<string, mixed> $choice `{item_id, use}` or `{photo_path}`
     * @param array<string, mixed> $content
     * @return array{path: ?string, source: string, item_id: ?int, photo_path: ?string, url: ?string}
     */
    private static function pickPhoto(array $choice, ?Item $boundItem, bool $small, array $content): array
    {
        $none = ['path' => null, 'source' => 'placeholder', 'item_id' => null, 'photo_path' => null, 'url' => null];
        $photoPath = (string) ($choice['photo_path'] ?? '');
        if ($photoPath !== '') {
            $file = PosterPhoto::uploadPath($photoPath);

            return $file !== null ? ['path' => $file, 'source' => 'upload', 'item_id' => null, 'photo_path' => $photoPath, 'url' => null] : $none;
        }
        $itemId = isset($choice['item_id']) ? (int) $choice['item_id'] : 0;
        $item = $itemId > 0 ? self::item($itemId) : $boundItem;
        if ($item === null) {
            return $none;
        }
        $use = (string) ($choice['use'] ?? '');
        if ($use === '') {
            $use = $small && is_string($item->cutout_url) && $item->cutout_url !== '' ? 'cutout' : 'main';
        }
        if ($use === 'cutout') {
            $file = PosterContent::photoFile($item->cutout_url);
            if ($file !== null) {
                return ['path' => $file, 'source' => 'cutout', 'item_id' => (int) $item->id, 'photo_path' => null, 'url' => $item->cutout_url];
            }
        }
        $master = PosterContent::photoFile($item->image_original_url);
        if ($master !== null) {
            return ['path' => $master, 'source' => 'master', 'item_id' => (int) $item->id, 'photo_path' => null, 'url' => $item->image_url];
        }
        $crop = PosterContent::photoFile($item->image_url);
        if ($crop !== null) {
            return ['path' => $crop, 'source' => 'crop', 'item_id' => (int) $item->id, 'photo_path' => null, 'url' => $item->image_url];
        }

        return $none;
    }

    /**
     * @param array<string, mixed> $content
     * @param array<string, mixed> $poster
     */
    private static function boundItem(array $content, array $poster): ?Item
    {
        $bindings = is_array($poster['bindings'] ?? null) ? $poster['bindings'] : [];
        $id = isset($bindings['item_id']) ? (int) $bindings['item_id'] : 0;

        return $id > 0 ? self::item($id) : null;
    }

    private static function item(int $id): ?Item
    {
        try {
            return Item::query()->find($id);
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * @param array{s: float, dy: float, bleed_units: float, ox: float, oy: float} $map
     * @param array<string, mixed> $logo
     * @return array<string, mixed>
     */
    private static function logoPiece(array $map, array $logo): array
    {
        $aspect = LogoVector::fromFile()->aspect();
        $h = PosterThemes::mapLength($map, (float) $logo['height_mm']);
        $w = $h * $aspect;
        [$cx, $top] = PosterThemes::mapPoint($map, (float) $logo['centre_x'], (float) $logo['top_y']);
        $piece = ['type' => 'logo', 'x' => $cx - $w / 2, 'y' => $top, 'w' => $w, 'h' => $h, 'colourway' => 'light', 'badge' => null];
        $badge = $logo['badge_circle'] ?? null;
        if (!empty($logo['cream_badge']) && is_array($badge)) {
            [$bx, $by] = PosterThemes::mapPoint($map, (float) $badge['cx'], (float) $badge['cy']);
            $hex = (string) ($badge['fill'] ?? BrandCmyk::HEX['cream']);
            $piece['badge'] = [
                'cx' => $bx, 'cy' => $by, 'r' => PosterThemes::mapLength($map, (float) $badge['r']),
                'cmyk' => BrandCmyk::forHex($hex), 'hex' => strtoupper($hex),
            ];
        }

        return $piece;
    }

    /**
     * @param array{s: float, dy: float, bleed_units: float, ox: float, oy: float} $map
     * @param array<string, mixed> $qr
     * @return array<string, mixed>
     */
    private static function qrPiece(array $map, array $qr, string $url): array
    {
        [$x, $y] = PosterThemes::mapPoint($map, (float) $qr['x'], (float) $qr['y']);
        $side = PosterThemes::mapLength($map, (float) $qr['size_mm']);
        $hex = (string) ($qr['colour'] ?? BrandCmyk::HEX['brown']);

        return [
            'type' => 'qr', 'x' => $x, 'y' => $y, 'w' => $side, 'h' => $side, 'url' => $url,
            'bare' => true, 'cmyk' => BrandCmyk::forHex($hex), 'hex' => strtoupper($hex),
        ];
    }

    /**
     * @param array{s: float, dy: float, bleed_units: float, ox: float, oy: float} $map
     * @param array<string, mixed> $slot
     * @param array<string, mixed> $content
     * @param array{overflow: bool, shrunk: bool, missing_dv: bool} $flags
     * @return array<string, mixed>|null null for a line the owner blanked
     */
    private static function textPiece(array $map, array $slot, mixed $value, array $content, float $floorPt, bool &$priceFilled, array &$flags): ?array
    {
        if ($value === false) {
            return null;
        }
        $auto = false;
        if (is_string($value) && trim($value) !== '') {
            $text = trim($value);
        } else {
            $text = (string) $slot['default'];
            if (!$priceFilled && ($slot['role_hint'] ?? '') === 'price_or_offer') {
                $live = self::livePrice($text, $content);
                if ($live !== null) {
                    $text = $live;
                    $auto = true;
                    $priceFilled = true;
                }
            }
        }
        if ($text === '') {
            return null;
        }

        $font = PosterThemes::FONTS[(string) $slot['font']];
        $dv = preg_match('/[\x{0780}-\x{07BF}]/u', $text) === 1;
        if ($dv) {
            $font = in_array($font, self::BOLD_FACES, true) ? 'dvb' : 'dv';
        }
        $pt = PosterThemes::mapPoints($map, (float) $slot['size_units']);
        $trackingEm = (float) ($slot['tracking_em'] ?? 0.0);
        $maxW = PosterThemes::mapLength($map, (float) $slot['max_width_mm']);
        $width = self::measure($text, $font, $pt, $trackingEm, $dv);
        if ($width > $maxW + 0.01 && $pt > $floorPt) {
            $pt = max($floorPt, $pt * $maxW / max(0.01, $width));
            $flags['shrunk'] = true;
            $width = self::measure($text, $font, $pt, $trackingEm, $dv);
        }
        if ($width > $maxW + 0.05) {
            $flags['overflow'] = true;
        }

        [$anchorX, $baseline] = PosterThemes::mapPoint($map, (float) $slot['anchor_x'], (float) $slot['baseline_y']);
        $align = (string) $slot['align'];
        $x = match ($align) {
            'center' => $anchorX - $width / 2,
            'right' => $anchorX - $width,
            default => $anchorX,
        };
        $ascent = PosterTextMeasure::ascent($font, $pt);
        $descent = abs(PosterTextMeasure::descent($font, $pt));
        $top = $baseline - $ascent;

        $colour = $slot['colour'];
        $hex = is_array($colour) ? (string) ($colour['fallback'] ?? BrandCmyk::HEX['brown']) : (string) $colour;
        $shadow = null;
        if (is_array($slot['shadow'] ?? null) && is_string($slot['shadow']['colour'] ?? null)) {
            $offset = PosterThemes::mapLength($map, (float) ($slot['shadow']['offset_mm'] ?? 0.0));
            $shadow = ['dx' => $offset, 'dy' => $offset, 'cmyk' => BrandCmyk::forHex($slot['shadow']['colour']), 'hex' => strtoupper($slot['shadow']['colour'])];
        }

        return [
            'type' => 'text',
            'slot' => (string) $slot['id'],
            'role' => (string) ($slot['role_hint'] ?? 'detail'),
            'x' => $x, 'y' => $top, 'w' => $width, 'h' => $ascent + $descent,
            'text' => $text, 'font' => $font, 'pt' => $pt, 'cmyk' => BrandCmyk::forHex($hex), 'hex' => strtoupper($hex),
            'align' => $align, 'dv' => $dv,
            'anchor' => $anchorX, 'baseline' => $baseline, 'ascent' => $ascent,
            'tracking' => $trackingEm * $pt * 0.352778,
            'tracking_em' => $trackingEm,
            'shadow' => $shadow,
            'opacity' => max(0.0, min(1.0, (float) ($slot['opacity'] ?? 1.0))),
            'max_w' => $maxW,
            'auto' => $auto,
        ];
    }

    /**
     * The live price in the design's own format for the first price slot:
     * the number in the default makes way for the dish's price, or the
     * percent for a percentage offer. Null when nothing is bound or the
     * default has no number to replace.
     *
     * @param array<string, mixed> $content
     */
    private static function livePrice(string $default, array $content): ?string
    {
        $price = trim((string) ($content['price'] ?? ''));
        if ($price === '' || preg_match('/\d+(?:\.\d+)?/', $default) !== 1) {
            return null;
        }
        if (preg_match('/^(\d+)% off$/i', $price, $m) === 1) {
            return str_contains($default, '%') ? (string) preg_replace('/\d+(?:\.\d+)?(?=\s*%)/', $m[1], $default, 1) : null;
        }
        if (preg_match('/(\d+(?:\.\d+)?)/', $price, $m) !== 1 || str_contains($default, '%')) {
            return null;
        }
        $number = (string) $m[1];
        if (str_ends_with($number, '.00')) {
            $number = substr($number, 0, -3);
        }

        return (string) preg_replace('/\d+(?:\.\d+)?/', $number, $default, 1);
    }

    private static function measure(string $text, string $font, float $pt, float $trackingEm, bool $dv): float
    {
        return PosterTextMeasure::width($text, $font, $pt, $trackingEm * $pt * 0.352778, $dv);
    }

    /**
     * Ops as SVG path data, for the preview's CSS clip-path.
     *
     * @param list<array{0: string, 1: list<float>}> $ops
     */
    public static function pathD(array $ops): string
    {
        $parts = [];
        foreach ($ops as [$op, $p]) {
            $parts[] = $op === 'Z' ? 'Z' : $op . ' ' . implode(' ', array_map(static fn (float $v): string => rtrim(rtrim(number_format($v, 3, '.', ''), '0'), '.'), $p));
        }

        return implode(' ', $parts);
    }
}
