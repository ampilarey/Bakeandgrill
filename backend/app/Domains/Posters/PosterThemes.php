<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use InvalidArgumentException;
use RuntimeException;

/**
 * The ready-made poster designs (docs/POSTER_THEMES_HANDOFF.md): the print
 * themes in 13 categories under resources/poster-themes, each with a `large`
 * variant for A2 and A3 and a `small` one for A4 and A5, and the screen
 * themes, each with a `tv` variant for a Full HD or 4K television and a
 * `tvp` one for a portrait screen. A theme is an alternative to a layout and
 * a mood: its artwork is a draw list in PdfX4Document::fillPath() op format,
 * its words are text slots (t1…) and its pictures photo slots (p1…), with
 * the same ids in every variant of the theme.
 *
 * Everything here reads the files once per request and validates what it
 * reads. An unknown theme is null from get() and false from has(); a size
 * a theme has no variant for, a landscape page, or a theme folder that is
 * missing or malformed throws, so a poster is never quietly drawn on the
 * wrong design.
 */
final class PosterThemes
{
    /** A theme is drawn for paper or for a screen (PaperSize::KIND_*). */
    public const KINDS = ['print', 'screen'];

    public const VARIANTS = ['large', 'small', 'tv', 'tvp'];

    /** The variants a theme of each kind carries. */
    public const KIND_VARIANTS = ['print' => ['large', 'small'], 'screen' => ['tv', 'tvp']];

    /** Size → variant (index.json `sizes`, the same in every theme of the kind). */
    public const SIZE_VARIANTS = [
        'A2' => 'large', 'A3' => 'large', 'A4' => 'small', 'A5' => 'small',
        'TV' => 'tv', 'TV4K' => 'tv', 'TVP' => 'tvp',
    ];

    /** The width of the print design canvas's trim in design units (mm at A2). */
    public const TRIM_UNITS = [420.0, 594.0];

    /** Each variant's trim in its own design units: mm at A2 for print, pixels at Full HD for screens. */
    public const VARIANT_TRIM = [
        'large' => [420.0, 594.0], 'small' => [420.0, 594.0],
        'tv' => [1920.0, 1080.0], 'tvp' => [1080.0, 1920.0],
    ];

    /** A theme's font name → the PosterFonts key that draws it. */
    public const FONTS = [
        'anton' => 'anton',
        'jakarta-500' => 'j5',
        'jakarta-700' => 'j7',
        'jakarta-800' => 'j8',
        'fraunces-500-italic' => 'fri5',
        'fraunces-700-italic' => 'fri7',
        'fraunces-900-italic' => 'fri9',
    ];

    public const ROLES = ['eyebrow', 'headline', 'headline_or_offer', 'price_or_offer', 'detail', 'footer'];

    /** What a theme folder may serve to the admin (PosterController::themeFile). */
    public const FILE_PATTERN = '/^(preview-(large|small|tv|tvp)\.jpg|backdrop-(large|small|tv|tvp)\.svg|placeholder-(large|small|tv|tvp)-p[1-9]\.png)$/';

    /** @var array<string, mixed>|null */
    private static ?array $index = null;

    /** @var array<string, array<string, mixed>> key → theme.json */
    private static array $themes = [];

    /** @var array<string, list<array<string, mixed>>> "key|variant" → draw list */
    private static array $drawLists = [];

    public static function root(): string
    {
        return rtrim((string) config('posters.themes_dir', resource_path('poster-themes')), '/');
    }

    /** Forget what was read (tests that point at another folder). */
    public static function reset(): void
    {
        self::$index = null;
        self::$themes = [];
        self::$drawLists = [];
    }

    /**
     * The categories in catalogue order, each with how many themes it holds,
     * all told and by kind.
     *
     * @return list<array{key: string, number: string, name: string, description: string, folder: string, count: int, counts: array{print: int, screen: int}}>
     */
    public static function categories(): array
    {
        $counts = [];
        foreach (self::index()['themes'] as $row) {
            $kind = self::rowKind($row);
            $counts[$row['category']][$kind] = ($counts[$row['category']][$kind] ?? 0) + 1;
        }
        $out = [];
        foreach (self::index()['categories'] as $category) {
            $key = (string) $category['key'];
            $byKind = ['print' => (int) ($counts[$key]['print'] ?? 0), 'screen' => (int) ($counts[$key]['screen'] ?? 0)];
            $out[] = [
                'key' => $key,
                'number' => (string) $category['number'],
                'name' => (string) $category['name'],
                'description' => (string) ($category['description'] ?? ''),
                'folder' => (string) $category['folder'],
                'count' => $byKind['print'] + $byKind['screen'],
                'counts' => $byKind,
            ];
        }

        return $out;
    }

    /** @return array<string, string> style key → label */
    public static function styles(): array
    {
        $out = [];
        foreach (self::index()['styles'] as $key => $label) {
            $out[(string) $key] = (string) $label;
        }

        return $out;
    }

    /**
     * Every theme, in catalogue order (the print designs BG-001 … BG-110,
     * then the screen designs), as its index row.
     *
     * @return list<array{id: string, key: string, title: string, kind: string, category: string, category_name: string, style: string, style_label: string, has_photo: bool, photo_slots: int, text_slots: int, path: string}>
     */
    public static function all(): array
    {
        $names = [];
        foreach (self::index()['categories'] as $category) {
            $names[(string) $category['key']] = (string) $category['name'];
        }
        $styles = self::styles();
        $out = [];
        foreach (self::index()['themes'] as $row) {
            $out[] = [
                'id' => (string) $row['id'],
                'key' => (string) $row['key'],
                'title' => (string) $row['title'],
                'kind' => self::rowKind($row),
                'category' => (string) $row['category'],
                'category_name' => $names[(string) $row['category']] ?? (string) $row['category'],
                'style' => (string) $row['style'],
                'style_label' => $styles[(string) $row['style']] ?? (string) $row['style'],
                'has_photo' => (bool) $row['has_photo'],
                'photo_slots' => (int) $row['photo_slots'],
                'text_slots' => (int) $row['text_slots'],
                'path' => (string) $row['path'],
            ];
        }

        return $out;
    }

    /** @return list<array<string, mixed>> the index rows of one category, in order */
    public static function inCategory(string $category): array
    {
        return array_values(array_filter(self::all(), static fn (array $row): bool => $row['category'] === $category));
    }

    /** @return list<array<string, mixed>> the index rows of one kind ('print' or 'screen'), in order */
    public static function ofKind(string $kind): array
    {
        return array_values(array_filter(self::all(), static fn (array $row): bool => $row['kind'] === $kind));
    }

    public static function has(string $key): bool
    {
        return self::indexRow($key) !== null;
    }

    /**
     * One theme's theme.json, validated, with every variant of its kind.
     * Null for a key that is not in the catalogue.
     *
     * @return array<string, mixed>|null
     */
    public static function get(string $key): ?array
    {
        if (isset(self::$themes[$key])) {
            return self::$themes[$key];
        }
        $row = self::indexRow($key);
        if ($row === null) {
            return null;
        }
        $file = self::root() . '/' . $row['path'] . '/theme.json';
        $theme = self::readJson($file);
        self::validateTheme($theme, $key, $row);
        $theme['path'] = (string) $row['path'];
        $theme['kind'] = self::rowKind($row);

        return self::$themes[$key] = $theme;
    }

    /**
     * 'print' or 'screen': what the theme is drawn for.
     *
     * @param array<string, mixed> $theme from get()
     */
    public static function kindOf(array $theme): string
    {
        return (string) ($theme['kind'] ?? 'print');
    }

    /** The kind of theme a page needs: a paper size takes a print theme, a screen a screen theme. */
    public static function kindForSize(PaperSize $size): string
    {
        return $size->isScreen() ? 'screen' : 'print';
    }

    /**
     * The variant a page is drawn from. Print themes are portrait only; a
     * screen's variant follows its orientation.
     */
    public static function variantNameFor(PaperSize $size): string
    {
        if (!$size->isScreen() && $size->landscape) {
            throw new InvalidArgumentException('Poster templates are portrait only.');
        }
        $name = self::SIZE_VARIANTS[$size->name] ?? null;
        if ($name === null) {
            throw new InvalidArgumentException("No poster template variant prints at {$size->name}.");
        }

        return $name;
    }

    /**
     * The variant of a theme that a page is drawn from.
     *
     * @param array<string, mixed> $theme from get()
     * @return array<string, mixed>
     */
    public static function variantFor(array $theme, PaperSize $size): array
    {
        $name = self::variantNameFor($size);
        $kind = self::kindOf($theme);
        if ($kind !== self::kindForSize($size)) {
            throw new RuntimeException(sprintf(
                'Poster template %s is a %s design; it cannot be drawn at %s.',
                $theme['key'] ?? '?',
                $kind === 'screen' ? 'TV' : 'print',
                $size->label(),
            ));
        }
        $map = is_array($theme['size_to_variant'] ?? null) ? $theme['size_to_variant'] : [];
        $picked = (string) ($map[$size->name] ?? '');
        if ($picked !== $name) {
            throw new RuntimeException(sprintf('Poster template %s maps %s to "%s", not "%s".', $theme['key'] ?? '?', $size->name, $picked, $name));
        }
        $variant = $theme['variants'][$name] ?? null;
        if (!is_array($variant)) {
            throw new RuntimeException(sprintf('Poster template %s has no "%s" variant.', $theme['key'] ?? '?', $name));
        }

        return $variant;
    }

    /**
     * The artwork of one variant: the draw list, read from its gzip once.
     *
     * @param array<string, mixed> $theme from get()
     * @return list<array<string, mixed>>
     */
    public static function drawList(array $theme, string $variant): array
    {
        $key = (string) ($theme['key'] ?? '');
        $cacheKey = $key . '|' . $variant;
        if (isset(self::$drawLists[$cacheKey])) {
            return self::$drawLists[$cacheKey];
        }
        $name = (string) ($theme['variants'][$variant]['files']['backdrop_draw_list'] ?? '');
        if ($name === '' || !preg_match('/^backdrop-(large|small|tv|tvp)\.json(\.gz)?$/', $name)) {
            throw new RuntimeException("Poster template {$key} names no draw list for its {$variant} variant.");
        }
        $file = self::root() . '/' . $theme['path'] . '/' . $name;
        $raw = @file_get_contents($file);
        if ($raw === false || $raw === '') {
            throw new RuntimeException("Poster template draw list missing: {$file}");
        }
        if (str_ends_with($name, '.gz')) {
            $raw = @gzdecode($raw);
            if ($raw === false) {
                throw new RuntimeException("Poster template draw list is not gzip: {$file}");
            }
        }
        $items = json_decode($raw, true);
        if (!is_array($items)) {
            throw new RuntimeException("Poster template draw list is not JSON: {$file}");
        }
        foreach ($items as $i => $item) {
            if (!is_array($item)) {
                throw new RuntimeException("Poster template {$key} {$variant} draw list item {$i} is not an object.");
            }
            if (isset($item['photo_slot'])) {
                continue;
            }
            foreach ($item['ops'] ?? [] as $op) {
                if (!is_array($op) || !in_array($op[0] ?? '', ['M', 'L', 'C', 'Z'], true)) {
                    throw new RuntimeException("Poster template {$key} {$variant} draw list item {$i} has an op that is not M, L, C or Z.");
                }
            }
        }

        return self::$drawLists[$cacheKey] = array_values($items);
    }

    /**
     * The photo slots in the order the artwork draws them (its markers).
     *
     * @param array<string, mixed> $theme from get()
     * @return list<string>
     */
    public static function photoOrder(array $theme, string $variant): array
    {
        $order = [];
        foreach (self::drawList($theme, $variant) as $item) {
            if (isset($item['photo_slot'])) {
                $order[] = (string) $item['photo_slot'];
            }
        }

        return $order;
    }

    /**
     * One layer of a variant's backdrop SVG for the on-screen preview: the
     * artwork split at its photo markers (`<rect id="__photo_marker_pN">`),
     * so a photo can sit between what the design draws before it and what
     * it draws after it (a polaroid's tape, a price badge). Layer 0 is
     * everything before the first photo; the last layer everything after the
     * last. Null for a layer the variant does not have.
     *
     * @param array<string, mixed> $theme from get()
     */
    public static function backdropLayer(array $theme, string $variant, int $layer): ?string
    {
        if (!in_array($variant, self::VARIANTS, true) || $layer < 0 || !isset($theme['variants'][$variant])) {
            return null;
        }
        $name = (string) ($theme['variants'][$variant]['files']['backdrop_svg'] ?? '');
        $file = self::root() . '/' . $theme['path'] . '/' . $name;
        $svg = $name !== '' ? @file_get_contents($file) : false;
        if ($svg === false || $svg === '') {
            throw new RuntimeException("Poster template backdrop missing: {$file}");
        }
        if (preg_match('/^(.*?<svg\b[^>]*>)(.*)(<\/svg>\s*)$/s', $svg, $m) !== 1) {
            throw new RuntimeException("Poster template backdrop is not an SVG: {$file}");
        }
        $body = $m[2];
        // The gradients live in one <defs> block at the top; every layer needs it.
        $defs = '';
        if (preg_match('/<defs>.*?<\/defs>/s', $body, $d) === 1) {
            $defs = $d[0];
            $body = str_replace($defs, '', $body);
        }
        $parts = preg_split('/<rect id="__photo_marker_p\d+"[^>]*\/>/', $body) ?: [$body];
        if ($layer >= count($parts)) {
            return null;
        }

        return $m[1] . $defs . $parts[$layer] . $m[3];
    }

    /**
     * The absolute path of a file the admin may fetch from a theme's folder
     * (a preview, a backdrop SVG or a placeholder), or null when the theme or
     * the file is not one of ours.
     */
    public static function file(string $key, string $name): ?string
    {
        $row = self::indexRow($key);
        if ($row === null || preg_match(self::FILE_PATTERN, $name) !== 1) {
            return null;
        }
        $file = self::root() . '/' . $row['path'] . '/' . $name;

        return is_file($file) ? $file : null;
    }

    /**
     * How a variant's design units land on a real page: `s` scales units to
     * page units (the page's trim width over the design's), `dy` centres the
     * design on a page that is not quite the design's shape (A5: 0.343 mm),
     * and (`ox`, `oy`) is where the design's bleed edge sits on the page
     * (docs/POSTER_THEMES_HANDOFF.md § 1). On a screen the design's units are
     * Full HD pixels, so `s` is 1 at Full HD and 2 at 4K, with no bleed.
     *
     * page_x = (u_x − bleed_units) · s + ox
     * page_y = (u_y − bleed_units) · s + oy
     * pt     = size_units · s / 0.352778
     *
     * @param array<string, mixed> $variant from variantFor()
     * @return array{s: float, dy: float, bleed_units: float, ox: float, oy: float}
     */
    public static function mapping(array $variant, PaperSize $size): array
    {
        [$trimW, $trimH] = self::trimUnits($variant);
        $s = $size->trimWidth / $trimW;
        $dy = ($size->trimHeight - $trimH * $s) / 2;
        $bleedUnits = (float) ($variant['canvas']['bleed_units'] ?? 0.0);

        return ['s' => $s, 'dy' => $dy, 'bleed_units' => $bleedUnits, 'ox' => $size->bleed, 'oy' => $size->bleed + $dy];
    }

    /**
     * A variant's trim in its own design units: from its canvas's trim box,
     * else the print design's A2 trim.
     *
     * @param array<string, mixed> $variant
     * @return array{0: float, 1: float}
     */
    public static function trimUnits(array $variant): array
    {
        $box = $variant['canvas']['trim_box'] ?? null;
        if (is_array($box) && count($box) === 4 && (float) $box[2] > 0 && (float) $box[3] > 0) {
            return [(float) $box[2], (float) $box[3]];
        }

        return self::VARIANT_TRIM[(string) ($variant['variant'] ?? 'large')] ?? self::TRIM_UNITS;
    }

    /** Design units → page units: [x, y]. */
    public static function mapPoint(array $map, float $x, float $y): array
    {
        return [
            ($x - $map['bleed_units']) * $map['s'] + $map['ox'],
            ($y - $map['bleed_units']) * $map['s'] + $map['oy'],
        ];
    }

    /** A length in design units → page units. */
    public static function mapLength(array $map, float $units): float
    {
        return $units * $map['s'];
    }

    /** An em size in design units → points on the page (a point is 0.352778 page units). */
    public static function mapPoints(array $map, float $units): float
    {
        return $units * $map['s'] / 0.352778;
    }

    /**
     * A box in design units → page units: [x, y, w, h].
     *
     * @param array{0: float, 1: float, 2: float, 3: float} $box
     * @return array{0: float, 1: float, 2: float, 3: float}
     */
    public static function mapBox(array $map, array $box): array
    {
        [$x, $y] = self::mapPoint($map, (float) $box[0], (float) $box[1]);

        return [$x, $y, (float) $box[2] * $map['s'], (float) $box[3] * $map['s']];
    }

    /**
     * Draw-list ops in design units → page units, the same shape.
     *
     * @param list<array{0: string, 1: list<float>}> $ops
     * @return list<array{0: string, 1: list<float>}>
     */
    public static function mapOps(array $map, array $ops): array
    {
        $out = [];
        foreach ($ops as [$op, $p]) {
            $q = [];
            $n = count($p);
            for ($i = 0; $i + 1 < $n; $i += 2) {
                [$x, $y] = self::mapPoint($map, (float) $p[$i], (float) $p[$i + 1]);
                $q[] = $x;
                $q[] = $y;
            }
            $out[] = [$op, $q];
        }

        return $out;
    }

    /** @param array<string, mixed> $row an index row */
    private static function rowKind(array $row): string
    {
        return ($row['kind'] ?? 'print') === 'screen' ? 'screen' : 'print';
    }

    /** @return array<string, mixed>|null */
    private static function indexRow(string $key): ?array
    {
        foreach (self::index()['themes'] as $row) {
            if ($row['key'] === $key) {
                return $row;
            }
        }

        return null;
    }

    /** @return array<string, mixed> */
    private static function index(): array
    {
        if (self::$index !== null) {
            return self::$index;
        }
        $index = self::readJson(self::root() . '/index.json');
        foreach (['categories', 'styles', 'sizes', 'themes'] as $key) {
            if (!is_array($index[$key] ?? null)) {
                throw new RuntimeException("Poster themes index has no \"{$key}\".");
            }
        }
        foreach (self::SIZE_VARIANTS as $size => $variant) {
            $listed = $index['sizes'][$size] ?? null;
            // The paper sizes are always listed; the screen sizes once screen themes are installed.
            if ($listed === null && PaperSize::kindOf($size) === PaperSize::KIND_SCREEN) {
                continue;
            }
            if ($listed !== $variant) {
                throw new RuntimeException("Poster themes index maps {$size} to something other than \"{$variant}\".");
            }
        }
        $categories = [];
        foreach ($index['categories'] as $category) {
            foreach (['key', 'number', 'name', 'folder'] as $field) {
                if (!is_string($category[$field] ?? null) || $category[$field] === '') {
                    throw new RuntimeException("A poster theme category has no {$field}.");
                }
            }
            $categories[$category['key']] = true;
        }
        $seen = [];
        foreach ($index['themes'] as $i => $row) {
            foreach (['id', 'key', 'title', 'category', 'style', 'path'] as $field) {
                if (!is_string($row[$field] ?? null) || $row[$field] === '') {
                    throw new RuntimeException("Poster theme row {$i} has no {$field}.");
                }
            }
            if (!isset($categories[$row['category']])) {
                throw new RuntimeException("Poster theme {$row['key']} is in an unknown category \"{$row['category']}\".");
            }
            if (!isset($index['styles'][$row['style']])) {
                throw new RuntimeException("Poster theme {$row['key']} has an unknown style \"{$row['style']}\".");
            }
            if (preg_match('/^[a-z0-9-]+$/', $row['key']) !== 1 || preg_match('#^[A-Za-z0-9-]+/[a-z0-9-]+$#', $row['path']) !== 1) {
                throw new RuntimeException("Poster theme {$row['key']} has a key or path that is not plain.");
            }
            if (isset($row['kind']) && !in_array($row['kind'], self::KINDS, true)) {
                throw new RuntimeException("Poster theme {$row['key']} has an unknown kind \"{$row['kind']}\".");
            }
            if (isset($seen[$row['key']])) {
                throw new RuntimeException("Poster theme key {$row['key']} is listed twice.");
            }
            $seen[$row['key']] = true;
            foreach (['has_photo' => 'bool', 'photo_slots' => 'int', 'text_slots' => 'int'] as $field => $type) {
                if (!array_key_exists($field, $row) || ($type === 'bool' ? !is_bool($row[$field]) : !is_int($row[$field]))) {
                    throw new RuntimeException("Poster theme {$row['key']} has no {$field}.");
                }
            }
        }
        if (isset($index['count']) && (int) $index['count'] !== count($index['themes'])) {
            throw new RuntimeException('Poster themes index count does not match its rows.');
        }

        return self::$index = $index;
    }

    /**
     * @param array<string, mixed> $theme
     * @param array<string, mixed> $row
     */
    private static function validateTheme(array $theme, string $key, array $row): void
    {
        $fail = static function (string $what) use ($key): never {
            throw new RuntimeException("Poster template {$key} is malformed: {$what}.");
        };
        if (($theme['key'] ?? null) !== $key || ($theme['id'] ?? null) !== $row['id']) {
            $fail('its theme.json names another key or id');
        }
        if (!is_string($theme['title'] ?? null) || (string) ($theme['category']['key'] ?? '') !== $row['category'] || ($theme['style'] ?? null) !== $row['style']) {
            $fail('its title, category or style differs from the index');
        }
        $kind = self::rowKind($row);
        if (($theme['kind'] ?? 'print') !== $kind) {
            $fail("its theme.json is not a {$kind} design as the index says");
        }
        $variants = self::KIND_VARIANTS[$kind];
        foreach (self::SIZE_VARIANTS as $size => $variant) {
            if (!in_array($variant, $variants, true)) {
                continue;
            }
            if (($theme['size_to_variant'][$size] ?? null) !== $variant) {
                $fail("size_to_variant does not map {$size} to {$variant}");
            }
        }
        $ids = [];
        foreach ($variants as $name) {
            $variant = $theme['variants'][$name] ?? null;
            if (!is_array($variant)) {
                $fail("the {$name} variant is missing");
            }
            $canvas = $variant['canvas'] ?? null;
            foreach (['width', 'height', 'bleed_units', 'safe_inset_units', 'min_text_units'] as $field) {
                if (!is_numeric($canvas[$field] ?? null)) {
                    $fail("the {$name} canvas has no {$field}");
                }
            }
            [$trimW, $trimH] = self::VARIANT_TRIM[$name];
            if (abs((float) $canvas['width'] - ($trimW + 2 * (float) $canvas['bleed_units'])) > 0.01
                || abs((float) $canvas['height'] - ($trimH + 2 * (float) $canvas['bleed_units'])) > 0.01) {
                $fail("the {$name} canvas is not its trim plus its bleed");
            }
            $box = $canvas['trim_box'] ?? null;
            if (is_array($box) && (count($box) !== 4 || abs((float) $box[2] - $trimW) > 0.01 || abs((float) $box[3] - $trimH) > 0.01)) {
                $fail("the {$name} canvas's trim box is not the variant's trim");
            }
            foreach (array_keys(self::SIZE_VARIANTS, $name, true) as $size) {
                if (!is_numeric($variant['sizes'][$size]['scale'] ?? null)) {
                    $fail("the {$name} variant has no scale for {$size}");
                }
            }
            if (!is_string($variant['files']['preview'] ?? null) || !is_string($variant['files']['backdrop_svg'] ?? null) || !is_string($variant['files']['backdrop_draw_list'] ?? null)) {
                $fail("the {$name} variant names no preview, backdrop or draw list");
            }
            $logo = $variant['logo'] ?? null;
            if (!is_numeric($logo['centre_x'] ?? null) || !is_numeric($logo['top_y'] ?? null) || !is_numeric($logo['height_mm'] ?? null)) {
                $fail("the {$name} logo has no centre, top or height");
            }
            if (!empty($logo['cream_badge']) && !is_numeric($logo['badge_circle']['r'] ?? null)) {
                $fail("the {$name} logo wants a cream badge but has no circle");
            }
            $qr = $variant['qr'] ?? null;
            if ($qr !== null && (!is_numeric($qr['x'] ?? null) || !is_numeric($qr['y'] ?? null) || !is_numeric($qr['size_mm'] ?? null))) {
                $fail("the {$name} QR has no box");
            }
            if (!is_array($variant['photo_slots'] ?? null) || !is_array($variant['text_slots'] ?? null)) {
                $fail("the {$name} variant has no slot lists");
            }
            $slotIds = [];
            foreach ($variant['photo_slots'] as $slot) {
                $id = (string) ($slot['id'] ?? '');
                if (preg_match('/^p[1-9]\d*$/', $id) !== 1) {
                    $fail("a {$name} photo slot has id \"{$id}\"");
                }
                if (!is_array($slot['box'] ?? null) || count($slot['box']) !== 4 || !is_array($slot['clip_ops'] ?? null) || $slot['clip_ops'] === []) {
                    $fail("photo slot {$id} ({$name}) has no box or clip");
                }
                if (!is_string($slot['clip_path_d'] ?? null) || !is_string($slot['placeholder_image'] ?? null) || !is_string($slot['fill_behind'] ?? null)) {
                    $fail("photo slot {$id} ({$name}) has no clip path, placeholder or fill");
                }
                $slotIds[] = $id;
            }
            foreach ($variant['text_slots'] as $slot) {
                $id = (string) ($slot['id'] ?? '');
                if (preg_match('/^t[1-9]\d*$/', $id) !== 1) {
                    $fail("a {$name} text slot has id \"{$id}\"");
                }
                if (!isset(self::FONTS[(string) ($slot['font'] ?? '')])) {
                    $fail("text slot {$id} ({$name}) uses an unknown font \"" . ($slot['font'] ?? '') . '"');
                }
                if (!is_string($slot['default'] ?? null) || !is_numeric($slot['size_units'] ?? null) || (float) $slot['size_units'] <= 0) {
                    $fail("text slot {$id} ({$name}) has no default or size");
                }
                if (!in_array($slot['align'] ?? '', ['left', 'center', 'right'], true) || !is_numeric($slot['anchor_x'] ?? null) || !is_numeric($slot['baseline_y'] ?? null) || !is_numeric($slot['max_width_mm'] ?? null)) {
                    $fail("text slot {$id} ({$name}) has no anchor, baseline, alignment or width");
                }
                if (!in_array($slot['role_hint'] ?? '', self::ROLES, true)) {
                    $fail("text slot {$id} ({$name}) has an unknown role");
                }
                $colour = $slot['colour'] ?? null;
                if (!(is_string($colour) && preg_match('/^#[0-9A-Fa-f]{6}$/', $colour) === 1)
                    && !(is_array($colour) && is_string($colour['fallback'] ?? null))) {
                    $fail("text slot {$id} ({$name}) has no colour");
                }
                $slotIds[] = $id;
            }
            if (count($slotIds) !== count(array_unique($slotIds))) {
                $fail("the {$name} variant repeats a slot id");
            }
            sort($slotIds);
            $ids[$name] = $slotIds;
        }
        $first = $variants[0];
        foreach ($variants as $name) {
            if ($ids[$name] !== $ids[$first]) {
                $fail("its {$first} and {$name} variants have different slot ids");
            }
        }
        if (count(array_filter($ids[$first], static fn (string $id): bool => $id[0] === 'p')) !== (int) $row['photo_slots']) {
            $fail('its photo slot count differs from the index');
        }
    }

    /** @return array<string, mixed> */
    private static function readJson(string $file): array
    {
        $raw = @file_get_contents($file);
        if ($raw === false || $raw === '') {
            throw new RuntimeException("Poster themes file missing: {$file}");
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new RuntimeException("Poster themes file is not JSON: {$file}");
        }

        return $decoded;
    }
}
