<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use Closure;
use InvalidArgumentException;

/**
 * An SVG path's `d` attribute as PDF path operators: moves, lines and
 * cubic curves (quadratics are raised to cubics, H and V become lines,
 * S and T get their reflected control point). Arcs are not drawn in the
 * logo and are refused rather than approximated. Each point passes
 * through a mapper so the caller places the shape in page millimetres.
 */
final class SvgPath
{
    /**
     * @param Closure(float, float): array{0: float, 1: float} $map SVG user units → page mm
     * @return list<array{0: string, 1: list<float>}> 'M' x y | 'L' x y | 'C' x1 y1 x2 y2 x3 y3 | 'Z'
     */
    public static function parse(string $d, Closure $map): array
    {
        preg_match_all('/([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/', $d, $m, PREG_SET_ORDER);
        $tokens = array_map(static fn (array $t): string => $t[0], $m);

        $ops = [];
        $i = 0;
        $n = count($tokens);
        $cmd = '';
        $cx = $cy = 0.0;
        $sx = $sy = 0.0;
        $lastCtrl = null;
        $lastCmd = '';

        $num = static function () use (&$i, $tokens, $n): float {
            if ($i >= $n || !is_numeric($tokens[$i])) {
                throw new InvalidArgumentException('SVG path: number expected.');
            }

            return (float) $tokens[$i++];
        };

        while ($i < $n) {
            $t = $tokens[$i];
            if (!is_numeric($t)) {
                $cmd = $t;
                $i++;
            } elseif ($cmd === '') {
                throw new InvalidArgumentException('SVG path: number before any command.');
            } elseif ($cmd === 'M') {
                $cmd = 'L';
            } elseif ($cmd === 'm') {
                $cmd = 'l';
            }
            $rel = ctype_lower($cmd);
            $upper = strtoupper($cmd);

            switch ($upper) {
                case 'M':
                    $x = $num();
                    $y = $num();
                    if ($rel) {
                        $x += $cx;
                        $y += $cy;
                    }
                    $cx = $sx = $x;
                    $cy = $sy = $y;
                    $ops[] = ['M', $map($x, $y)];
                    $lastCtrl = null;
                    break;
                case 'L':
                    $x = $num();
                    $y = $num();
                    if ($rel) {
                        $x += $cx;
                        $y += $cy;
                    }
                    $cx = $x;
                    $cy = $y;
                    $ops[] = ['L', $map($x, $y)];
                    $lastCtrl = null;
                    break;
                case 'H':
                    $x = $num();
                    if ($rel) {
                        $x += $cx;
                    }
                    $cx = $x;
                    $ops[] = ['L', $map($cx, $cy)];
                    $lastCtrl = null;
                    break;
                case 'V':
                    $y = $num();
                    if ($rel) {
                        $y += $cy;
                    }
                    $cy = $y;
                    $ops[] = ['L', $map($cx, $cy)];
                    $lastCtrl = null;
                    break;
                case 'C':
                case 'S':
                    if ($upper === 'C') {
                        $x1 = $num();
                        $y1 = $num();
                        if ($rel) {
                            $x1 += $cx;
                            $y1 += $cy;
                        }
                    } else {
                        [$x1, $y1] = ($lastCtrl !== null && in_array($lastCmd, ['C', 'S'], true))
                            ? [2 * $cx - $lastCtrl[0], 2 * $cy - $lastCtrl[1]]
                            : [$cx, $cy];
                    }
                    $x2 = $num();
                    $y2 = $num();
                    $x = $num();
                    $y = $num();
                    if ($rel) {
                        $x2 += $cx;
                        $y2 += $cy;
                        $x += $cx;
                        $y += $cy;
                    }
                    $ops[] = ['C', [...$map($x1, $y1), ...$map($x2, $y2), ...$map($x, $y)]];
                    $lastCtrl = [$x2, $y2];
                    $cx = $x;
                    $cy = $y;
                    break;
                case 'Q':
                case 'T':
                    if ($upper === 'Q') {
                        $qx = $num();
                        $qy = $num();
                        if ($rel) {
                            $qx += $cx;
                            $qy += $cy;
                        }
                    } else {
                        [$qx, $qy] = ($lastCtrl !== null && in_array($lastCmd, ['Q', 'T'], true))
                            ? [2 * $cx - $lastCtrl[0], 2 * $cy - $lastCtrl[1]]
                            : [$cx, $cy];
                    }
                    $x = $num();
                    $y = $num();
                    if ($rel) {
                        $x += $cx;
                        $y += $cy;
                    }
                    $x1 = $cx + 2 / 3 * ($qx - $cx);
                    $y1 = $cy + 2 / 3 * ($qy - $cy);
                    $x2 = $x + 2 / 3 * ($qx - $x);
                    $y2 = $y + 2 / 3 * ($qy - $y);
                    $ops[] = ['C', [...$map($x1, $y1), ...$map($x2, $y2), ...$map($x, $y)]];
                    $lastCtrl = [$qx, $qy];
                    $cx = $x;
                    $cy = $y;
                    break;
                case 'Z':
                    $ops[] = ['Z', []];
                    $cx = $sx;
                    $cy = $sy;
                    $lastCtrl = null;
                    break;
                case 'A':
                    throw new InvalidArgumentException('SVG path: arcs are not supported.');
                default:
                    throw new InvalidArgumentException("SVG path: unknown command \"{$cmd}\".");
            }
            $lastCmd = $upper;
        }

        return $ops;
    }

    /**
     * The box the ops cover, from their end and control points: [minX, minY, maxX, maxY].
     *
     * @param list<array{0: string, 1: list<float>}> $ops
     */
    public static function bounds(array $ops): array
    {
        $xs = [];
        $ys = [];
        foreach ($ops as [, $p]) {
            for ($i = 0; $i + 1 < count($p); $i += 2) {
                $xs[] = $p[$i];
                $ys[] = $p[$i + 1];
            }
        }
        if ($xs === []) {
            return [0.0, 0.0, 0.0, 0.0];
        }

        return [min($xs), min($ys), max($xs), max($ys)];
    }
}
