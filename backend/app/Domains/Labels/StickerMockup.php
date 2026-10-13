<?php

declare(strict_types=1);

namespace App\Domains\Labels;

/**
 * The mock-up preview (round 14 of the usability work, owner, 2026-10-13: "a
 * mock-up preview on a jar or bottle photo, so the wrap and round labels are
 * judged as they will be seen"): the first sticker drawn on a jar, a bottle,
 * a box or a lid, in millimetres, by the same pieces the sheet prints.
 *
 * A label on a curved side is cut into upright strips, each squeezed by how
 * far round the cylinder it sits (the projection of an arc onto the front),
 * so the middle reads straight on and the edges turn away. A wrap-around
 * label goes round the whole bottle and shows its front half; any other
 * label covers a third of the jar. A lid is seen from above at a tilt; a box
 * carries the label flat on its front.
 */
final class StickerMockup
{
    public const SURFACES = ['jar', 'bottle', 'box', 'lid'];

    /** Upright strips a curved label is cut into: smooth enough at preview size. */
    public const STRIPS = 28;

    /** How much a lid seen at a tilt is squashed upright. */
    public const SQUASH = 0.62;

    /** Everyday names, for the admin's picker. */
    public const NAMES = ['jar' => 'On a jar', 'bottle' => 'On a bottle', 'box' => 'On a box', 'lid' => 'On a lid'];

    /** The surfaces offered for a label's shape and design, the likeliest first. */
    public static function surfacesFor(string $shape, string $design): array
    {
        if ($shape === 'circle') {
            return ['lid', 'jar', 'box'];
        }

        return $design === 'wrap' ? ['bottle', 'jar', 'box'] : ['jar', 'bottle', 'box', 'lid'];
    }

    public static function valid(?string $surface): ?string
    {
        return $surface !== null && in_array($surface, self::SURFACES, true) ? $surface : null;
    }

    /**
     * Where everything goes, in mm on a scene 4 : 3 (the admin's frame).
     *
     * @return array{surface: string, w: float, h: float, label: array{x: float, y: float, w: float, h: float}, paper: array{w: float, h: float}, curved: bool, strips: list<array{sx: float, sw: float, px: float, pw: float}>, body: array<string, float>, round: bool}
     */
    public static function scene(string $surface, float $w, float $h, string $shape, string $design): array
    {
        $round = $shape === 'circle';
        $wrap = $design === 'wrap';
        $curved = in_array($surface, ['jar', 'bottle'], true);
        $strips = [];
        $body = [];

        if ($curved) {
            // A wrap label goes all the way round; any other covers 120° of the side.
            $r = $wrap && $surface === 'bottle' ? $w / (2 * M_PI) : (3 * $w) / (2 * M_PI);
            $alpha = min(M_PI / 2, ($w / 2) / $r);
            $bodyW = 2 * $r;
            $pad = max(6.0, $h * 0.22);
            $bodyH = $h + 2 * $pad;
            $capH = $surface === 'jar' ? max(8.0, min($bodyW * 0.16, 22.0)) : max(10.0, $bodyH * 0.18);
            $neckH = $surface === 'bottle' ? max(10.0, $bodyH * 0.28) : 0.0;
            $neckW = $surface === 'bottle' ? $bodyW * 0.42 : $bodyW * 0.92;
            $capW = $surface === 'bottle' ? $neckW * 1.08 : $bodyW * 0.96;
            $innerW = $bodyW;
            $innerH = $capH + $neckH + $bodyH;
            [$sceneW, $sceneH, $ox, $oy] = self::frame($innerW, $innerH);
            $cx = $ox + $bodyW / 2;
            $bodyY = $oy + $capH + $neckH;
            $labelY = $bodyY + $pad;
            for ($i = 0; $i < self::STRIPS; $i++) {
                $a0 = -$alpha + 2 * $alpha * $i / self::STRIPS;
                $a1 = -$alpha + 2 * $alpha * ($i + 1) / self::STRIPS;
                $strips[] = [
                    'sx' => round($w / 2 + $r * $a0, 3),
                    'sw' => round($r * ($a1 - $a0), 3),
                    'px' => round($cx + $r * sin($a0), 3),
                    'pw' => round($r * (sin($a1) - sin($a0)), 3),
                ];
            }
            $projW = $r * (sin($alpha) - sin(-$alpha));
            $label = ['x' => round($cx - $projW / 2, 3), 'y' => round($labelY, 3), 'w' => round($projW, 3), 'h' => $h];
            $body = [
                'x' => $ox, 'y' => $bodyY, 'w' => $bodyW, 'h' => $bodyH,
                'neck_x' => $cx - $neckW / 2, 'neck_y' => $oy + $capH, 'neck_w' => $neckW, 'neck_h' => $neckH,
                'cap_x' => $cx - $capW / 2, 'cap_y' => $oy, 'cap_w' => $capW, 'cap_h' => $capH,
            ];
        } elseif ($surface === 'lid') {
            // Seen from above at a tilt: the lid and its label are squashed upright by SQUASH; the label sits inside the lid's circle.
            $span = $round ? max($w, $h) : hypot($w, $h);
            $lidD = $span + max(8.0, $span * 0.12);
            $rim = max(4.0, $lidD * 0.07);
            [$sceneW, $sceneH, $ox, $oy] = self::frame($lidD, $lidD * self::SQUASH + $rim);
            $label = ['x' => round(($lidD - $w) / 2, 3), 'y' => round(($lidD - $h) / 2, 3), 'w' => $w, 'h' => $h];
            $body = ['x' => $ox, 'y' => $oy, 'w' => $lidD, 'h' => $lidD, 'rim' => $rim, 'squash' => self::SQUASH];
        } else {
            $marginX = max(12.0, $w * 0.28);
            $marginY = max(12.0, $h * 0.3);
            $faceW = $w + 2 * $marginX;
            $faceH = $h + 2 * $marginY;
            $topH = $faceH * 0.22;
            $sideW = $faceW * 0.16;
            [$sceneW, $sceneH, $ox, $oy] = self::frame($faceW + $sideW, $faceH + $topH);
            $label = ['x' => round($ox + $marginX, 3), 'y' => round($oy + $topH + $marginY, 3), 'w' => $w, 'h' => $h];
            $body = ['x' => $ox, 'y' => $oy + $topH, 'w' => $faceW, 'h' => $faceH, 'top' => $topH, 'side' => $sideW];
        }

        return [
            'surface' => $surface,
            'w' => round($sceneW, 3),
            'h' => round($sceneH, 3),
            'label' => $label,
            // The label itself, flat: what a strip cuts from.
            'paper' => ['w' => $w, 'h' => $h],
            'curved' => $curved,
            'strips' => $strips,
            'body' => array_map(fn ($v) => round((float) $v, 3), $body),
            'round' => $round,
        ];
    }

    /**
     * A 4 : 3 scene round a thing of this size, with room on every side.
     *
     * @return array{0: float, 1: float, 2: float, 3: float} scene w, h and the thing's top-left
     */
    private static function frame(float $w, float $h): array
    {
        $sceneW = max($w * 1.3, $h * 1.3 * 4 / 3);
        $sceneH = $sceneW * 3 / 4;

        return [$sceneW, $sceneH, ($sceneW - $w) / 2, ($sceneH - $h) / 2];
    }
}
