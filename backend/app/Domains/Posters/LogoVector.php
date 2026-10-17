<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use DOMDocument;
use DOMElement;
use DOMXPath;
use RuntimeException;

/**
 * The brand mark as paths, for the print PDF (docs/POSTER_PLAN.md § 6.4).
 *
 * The logos BrandImages serves are 1080 px bitmaps, soft on an A2. The
 * animated web logo (public/brand/logo-animated.svg) holds the mark as
 * seven filled paths: four flames, the wordmark, the ampersand and "Cafe".
 * This reads those paths once, maps each fill to a brand colour (two of
 * them are gradients in the SVG; they print as the solid rust-family
 * colour nearest their middle, "way (a)" of § 6.4), and gives them back
 * either scaled into page millimetres for PdfX4Document::fillPath() or as
 * a still SVG for the web with the animation, the glow filter and the
 * off-palette rust removed.
 */
final class LogoVector
{
    /** The SVG's rust is one step off the palette's; the still copy uses the palette. */
    private const SVG_RUST = '#B84B0C';

    /** fill in the SVG → brand role (BrandCmyk::HEX). */
    private const FILL_ROLES = [
        '#1c1408' => 'brown',
        '#fffdf9' => 'cream',
        '#cb7f1d' => 'amber',
        '#b84b0c' => 'rust',
        '#b74b0c' => 'rust',
        'url(#bgl-drop)' => 'flame',
        'url(#bgl-amp)' => 'amber',
    ];

    /** @var list<array{id: string, role: string, d: string}> */
    private array $shapes = [];

    /** @var array{0: float, 1: float, 2: float, 3: float} viewBox x y w h */
    private array $viewBox = [0.0, 0.0, 1.0, 1.0];

    private function __construct(private readonly string $svg) {}

    public static function fromFile(?string $path = null): self
    {
        $path ??= (string) config('posters.logo_svg', public_path('brand/logo-animated.svg'));
        $svg = @file_get_contents($path);
        if ($svg === false || $svg === '') {
            throw new RuntimeException("Logo SVG not readable: {$path}");
        }
        $self = new self($svg);
        $self->parse();

        return $self;
    }

    /** @return list<array{id: string, role: string, d: string}> */
    public function shapes(): array
    {
        return $this->shapes;
    }

    /** Width ÷ height of the mark's box. */
    public function aspect(): float
    {
        return $this->viewBox[2] / $this->viewBox[3];
    }

    /**
     * The shapes scaled so the mark is $width mm wide with its top-left at
     * ($x, $y), each with its path ops and its CMYK.
     *
     * @return list<array{id: string, role: string, cmyk: array{0: float, 1: float, 2: float, 3: float}, ops: list<array{0: string, 1: list<float>}>}>
     */
    public function placed(float $x, float $y, float $width, string $colourway = 'light'): array
    {
        $scale = $width / $this->viewBox[2];
        $out = [];
        foreach ($this->shapes as $shape) {
            $role = $shape['role'];
            if ($colourway === 'dark' && $role === 'brown') {
                $role = 'cream';
            }
            $ops = SvgPath::parse($shape['d'], function (float $px, float $py) use ($x, $y, $scale): array {
                return [$x + ($px - $this->viewBox[0]) * $scale, $y + ($py - $this->viewBox[1]) * $scale];
            });
            $out[] = ['id' => $shape['id'], 'role' => $role, 'cmyk' => BrandCmyk::chosen($role), 'ops' => $ops];
        }

        return $out;
    }

    /** Height in mm of the mark when $width mm wide. */
    public function heightFor(float $width): float
    {
        return $width / $this->aspect();
    }

    /**
     * A still SVG: no <style>, no animation, no glow filter, no classes,
     * the rust on palette, and for the dark colourway the wordmark in cream.
     */
    public function stillSvg(string $colourway = 'light'): string
    {
        $doc = new DOMDocument;
        $doc->loadXML($this->svg, LIBXML_NONET);
        $xp = new DOMXPath($doc);
        $xp->registerNamespace('s', 'http://www.w3.org/2000/svg');

        foreach (['//s:style', '//s:filter', '//s:animate', '//s:animateTransform', '//s:set'] as $q) {
            foreach (iterator_to_array($xp->query($q) ?: []) as $node) {
                $node->parentNode?->removeChild($node);
            }
        }
        foreach (iterator_to_array($xp->query('//*[@filter or @class]') ?: []) as $el) {
            if ($el instanceof DOMElement) {
                $el->removeAttribute('filter');
                $el->removeAttribute('class');
            }
        }
        foreach (iterator_to_array($xp->query('//*[@fill]') ?: []) as $el) {
            if (!$el instanceof DOMElement) {
                continue;
            }
            $fill = strtolower($el->getAttribute('fill'));
            if ($fill === strtolower(self::SVG_RUST)) {
                $el->setAttribute('fill', BrandCmyk::HEX['rust']);
            } elseif ($colourway === 'dark' && $fill === strtolower(BrandCmyk::HEX['brown'])) {
                $el->setAttribute('fill', '#FFFDF9');
            } elseif ($colourway === 'light' && $fill === '#fffdf9') {
                $el->setAttribute('fill', BrandCmyk::HEX['brown']);
            }
        }
        $root = $doc->documentElement;
        if ($root instanceof DOMElement) {
            $root->removeAttribute('class');
        }
        $xml = $doc->saveXML($doc->documentElement);

        return $xml === false ? $this->svg : $xml . "\n";
    }

    private function parse(): void
    {
        $doc = new DOMDocument;
        if (!@$doc->loadXML($this->svg, LIBXML_NONET)) {
            throw new RuntimeException('Logo SVG does not parse.');
        }
        $root = $doc->documentElement;
        if (!$root instanceof DOMElement) {
            throw new RuntimeException('Logo SVG has no root.');
        }
        $vb = preg_split('/[\s,]+/', trim($root->getAttribute('viewBox'))) ?: [];
        if (count($vb) === 4) {
            $this->viewBox = [(float) $vb[0], (float) $vb[1], (float) $vb[2], (float) $vb[3]];
        }
        $xp = new DOMXPath($doc);
        $xp->registerNamespace('s', 'http://www.w3.org/2000/svg');
        foreach (iterator_to_array($xp->query('//s:path') ?: []) as $path) {
            if (!$path instanceof DOMElement) {
                continue;
            }
            $fill = '';
            $id = '';
            for ($el = $path; $el instanceof DOMElement; $el = $el->parentNode) {
                if ($fill === '' && $el->hasAttribute('fill')) {
                    $fill = $el->getAttribute('fill');
                }
                if ($id === '' && $el->hasAttribute('id')) {
                    $id = $el->getAttribute('id');
                }
                if ($fill !== '' && $id !== '') {
                    break;
                }
            }
            $role = self::FILL_ROLES[strtolower(trim($fill))] ?? null;
            if ($role === null) {
                throw new RuntimeException("Logo SVG fill \"{$fill}\" on \"{$id}\" is not a brand colour.");
            }
            $d = trim($path->getAttribute('d'));
            if ($d === '') {
                continue;
            }
            $this->shapes[] = ['id' => $id, 'role' => $role, 'd' => $d];
        }
        if ($this->shapes === []) {
            throw new RuntimeException('Logo SVG has no paths.');
        }
    }
}
