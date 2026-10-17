<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use InvalidArgumentException;

/**
 * A poster's paper: the trim size, the bleed beyond the cut, and the safe
 * zone inside it (docs/POSTER_PLAN.md § 3). Sizes are in millimetres,
 * portrait unless turned.
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
    ) {}

    public static function named(string $name, bool $landscape = false, float $bleed = self::DEFAULT_BLEED): self
    {
        $key = strtoupper(trim($name));
        if (!isset(self::SIZES[$key])) {
            throw new InvalidArgumentException("Unknown poster size \"{$name}\".");
        }
        [$w, $h, $safe] = self::SIZES[$key];
        if ($landscape) {
            [$w, $h] = [$h, $w];
        }

        return new self($key, $w, $h, $safe, $bleed, $landscape);
    }

    /** Stand-offs and eyelets sit at the corners; the circle is this many mm across (docs/POSTER_PLAN.md § 3). */
    public function keepOutMm(): float
    {
        return $this->name === 'A2' ? 20.0 : 15.0;
    }

    /**
     * The same size for a poster mounted with stand-offs or eyelets: the safe
     * zone grows past the corner circles (centred one circle in from the cut,
     * reaching one and a half across), so the layout keeps its logo, QR and
     * text clear of the hardware. Any other mounting changes nothing.
     */
    public function mounted(string $mounting): self
    {
        if (!in_array($mounting, ['standoffs', 'eyelets'], true)) {
            return $this;
        }
        $safe = max($this->safe, $this->keepOutMm() * 1.5 + 1.0);

        return new self($this->name, $this->trimWidth, $this->trimHeight, $safe, $this->bleed, $this->landscape);
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

    /** The safe zone as a box in page millimetres (page origin at the bleed edge): [x, y, w, h]. */
    public function safeBox(): array
    {
        $inset = $this->bleed + $this->safe;

        return [$inset, $inset, $this->trimWidth - 2 * $this->safe, $this->trimHeight - 2 * $this->safe];
    }

    /** The trim as a box in page millimetres: [x, y, w, h]. */
    public function trimBox(): array
    {
        return [$this->bleed, $this->bleed, $this->trimWidth, $this->trimHeight];
    }

    /** Pixels a full-bleed photo needs at $ppi: [w, h]. */
    public function pixelsAt(int $ppi): array
    {
        return [
            (int) ceil($this->bleedWidth() / 25.4 * $ppi),
            (int) ceil($this->bleedHeight() / 25.4 * $ppi),
        ];
    }

    /** The resolution a photo of $px × $py gives when it fills the bleed. */
    public function ppiOf(int $px, int $py): float
    {
        return min($px / ($this->bleedWidth() / 25.4), $py / ($this->bleedHeight() / 25.4));
    }

    public function amberPpi(): int
    {
        return self::PPI_AMBER[$this->name];
    }
}
