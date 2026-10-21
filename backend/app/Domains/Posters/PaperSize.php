<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use InvalidArgumentException;

/**
 * A poster's page: paper (the trim size in millimetres, the bleed beyond the
 * cut, and the safe zone inside it, docs/POSTER_PLAN.md § 3), or a screen (a
 * TV's pixels, no bleed, a safe zone for the TV's own overscan). Every
 * coordinate the pieces carry is in the page's units: millimetres on paper,
 * pixels on a screen, so one piece list draws the print file and the TV
 * picture alike. Paper is portrait unless turned; a screen's orientation is
 * its own.
 */
final class PaperSize
{
    /** @var array<string, array{0: float, 1: float, 2: float}> name → [trim w, trim h, safe zone] */
    public const SIZES = [
        'A5' => [148.0, 210.0, 5.0],
        'A4' => [210.0, 297.0, 5.0],
        'A3' => [297.0, 420.0, 8.0],
        'A2' => [420.0, 594.0, 8.0],
    ];

    /**
     * Screens: name → [width px, height px, safe zone px, label]. The safe zone
     * keeps text off the edge a TV may hide (overscan). A screen's units are its
     * own pixels: the TV designs are drawn at Full HD and scale up to 4K.
     *
     * @var array<string, array{0: float, 1: float, 2: float, 3: string}>
     */
    public const SCREENS = [
        'TV' => [1920.0, 1080.0, 60.0, 'TV · Full HD'],
        'TV4K' => [3840.0, 2160.0, 120.0, 'TV · 4K'],
        'TVP' => [1080.0, 1920.0, 60.0, 'TV · Portrait'],
    ];

    public const KIND_PAPER = 'paper';

    public const KIND_SCREEN = 'screen';

    /** The height (or a portrait screen's width) the TV designs are drawn at. */
    public const SCREEN_BASE_PX = 1080.0;

    public const DEFAULT_BLEED = 3.0;

    /** Amber lines for photo resolution per size (§ 8, § 14). */
    public const PPI_AMBER = ['A5' => 200, 'A4' => 200, 'A3' => 120, 'A2' => 120];

    public const PPI_RED = 100;

    private function __construct(
        public readonly string $name,
        public readonly float $trimWidth,
        public readonly float $trimHeight,
        public readonly float $safe,
        public readonly float $bleed,
        public readonly bool $landscape,
        public readonly string $kind = self::KIND_PAPER,
    ) {}

    /**
     * A paper size, turned when asked, or a screen (whose orientation is its
     * own, so `$landscape` is ignored and it has no bleed).
     */
    public static function named(string $name, bool $landscape = false, float $bleed = self::DEFAULT_BLEED): self
    {
        $key = strtoupper(trim($name));
        if (isset(self::SCREENS[$key])) {
            [$w, $h, $safe] = self::SCREENS[$key];

            return new self($key, $w, $h, $safe, 0.0, $w > $h, self::KIND_SCREEN);
        }
        if (!isset(self::SIZES[$key])) {
            throw new InvalidArgumentException("Unknown poster size \"{$name}\".");
        }
        [$w, $h, $safe] = self::SIZES[$key];
        if ($landscape) {
            [$w, $h] = [$h, $w];
        }

        return new self($key, $w, $h, $safe, $bleed, $landscape);
    }

    public static function isKnown(string $name): bool
    {
        $key = strtoupper(trim($name));

        return isset(self::SIZES[$key]) || isset(self::SCREENS[$key]);
    }

    /** 'paper', 'screen', or null for a name that is neither. */
    public static function kindOf(string $name): ?string
    {
        $key = strtoupper(trim($name));
        if (isset(self::SCREENS[$key])) {
            return self::KIND_SCREEN;
        }

        return isset(self::SIZES[$key]) ? self::KIND_PAPER : null;
    }

    /**
     * The screen sizes for a catalogue: key, label, pixels and orientation.
     *
     * @return list<array{key: string, label: string, px: array{0: int, 1: int}, landscape: bool}>
     */
    public static function screens(): array
    {
        $out = [];
        foreach (self::SCREENS as $key => [$w, $h, , $label]) {
            $out[] = ['key' => $key, 'label' => $label, 'px' => [(int) $w, (int) $h], 'landscape' => $w > $h];
        }

        return $out;
    }

    public function isScreen(): bool
    {
        return $this->kind === self::KIND_SCREEN;
    }

    /** "A4", or "TV · Full HD (1920 × 1080)". */
    public function label(): string
    {
        if (!$this->isScreen()) {
            return $this->name;
        }

        return self::SCREENS[$this->name][3] . ' (' . (int) $this->trimWidth . ' × ' . (int) $this->trimHeight . ')';
    }

    /**
     * The screen's pixels: [w, h]. A screen page has no bleed, so this is the
     * whole page.
     *
     * @return array{0: int, 1: int}
     */
    public function pixels(): array
    {
        return [(int) round($this->trimWidth), (int) round($this->trimHeight)];
    }

    /**
     * How much bigger this screen is than the Full HD design: 1 at 1080p, 2 at
     * 4K, 1 on a portrait Full HD screen. Everything sized "at Full HD" (the
     * type floor, the smallest readable QR) is multiplied by it. 1 on paper.
     */
    public function screenScale(): float
    {
        if (!$this->isScreen()) {
            return 1.0;
        }

        return ($this->landscape ? $this->trimHeight : $this->trimWidth) / self::SCREEN_BASE_PX;
    }

    /** Stand-offs and eyelets sit at the corners; the circle is this many mm across (docs/POSTER_PLAN.md § 3). A screen has none. */
    public function keepOutMm(): float
    {
        if ($this->isScreen()) {
            return 0.0;
        }

        return $this->name === 'A2' ? 20.0 : 15.0;
    }

    /**
     * The same size for a poster mounted with stand-offs or eyelets: the safe
     * zone grows past the corner circles (centred one circle in from the cut,
     * reaching one and a half across), so the layout keeps its logo, QR and
     * text clear of the hardware. Any other mounting, and any screen, changes
     * nothing.
     */
    public function mounted(string $mounting): self
    {
        if ($this->isScreen() || !in_array($mounting, ['standoffs', 'eyelets'], true)) {
            return $this;
        }
        $safe = max($this->safe, $this->keepOutMm() * 1.5 + 1.0);

        return new self($this->name, $this->trimWidth, $this->trimHeight, $safe, $this->bleed, $this->landscape, $this->kind);
    }

    /** A sheet that is already its final size, with no extra bleed of its own. */
    public static function custom(float $width, float $height): self
    {
        return new self('SHEET', $width, $height, 0.0, 0.0, $width > $height);
    }

    public function bleedWidth(): float
    {
        return $this->trimWidth + 2 * $this->bleed;
    }

    public function bleedHeight(): float
    {
        return $this->trimHeight + 2 * $this->bleed;
    }

    /** The safe zone as a box in page units (page origin at the bleed edge): [x, y, w, h]. */
    public function safeBox(): array
    {
        $inset = $this->bleed + $this->safe;

        return [$inset, $inset, $this->trimWidth - 2 * $this->safe, $this->trimHeight - 2 * $this->safe];
    }

    /** The trim as a box in page units: [x, y, w, h]. */
    public function trimBox(): array
    {
        return [$this->bleed, $this->bleed, $this->trimWidth, $this->trimHeight];
    }

    /** Pixels a full-bleed photo needs at $ppi: [w, h]. Paper only. */
    public function pixelsAt(int $ppi): array
    {
        return [
            (int) ceil($this->bleedWidth() / 25.4 * $ppi),
            (int) ceil($this->bleedHeight() / 25.4 * $ppi),
        ];
    }

    /** The resolution a photo of $px × $py gives when it fills the bleed. Paper only. */
    public function ppiOf(int $px, int $py): float
    {
        return min($px / ($this->bleedWidth() / 25.4), $py / ($this->bleedHeight() / 25.4));
    }

    public function amberPpi(): int
    {
        return self::PPI_AMBER[$this->name] ?? 120;
    }
}
