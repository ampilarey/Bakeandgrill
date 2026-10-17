<?php

declare(strict_types=1);

namespace App\Domains\Posters\Spike;

use App\Domains\Posters\Pdf\OutputIntent;

/**
 * What the host can and cannot do for posters (docs/POSTER_PLAN.md
 * § 13, Phase 0: "host check for Imagick and Ghostscript"). Read-only.
 *
 * @phpstan-type Row array{check: string, value: string, ok: bool, note: string}
 */
final class HostCheck
{
    /** @return list<Row> */
    public static function run(OutputIntent $intent): array
    {
        $rows = [];
        $rows[] = ['check' => 'PHP', 'value' => PHP_VERSION, 'ok' => PHP_VERSION_ID >= 80200, 'note' => ''];

        $gd = extension_loaded('gd');
        $gdInfo = $gd ? gd_info() : [];
        $rows[] = [
            'check' => 'GD',
            'value' => $gd ? (string) ($gdInfo['GD Version'] ?? 'yes') : 'missing',
            'ok' => $gd && !empty($gdInfo['JPEG Support']) && !empty($gdInfo['PNG Support']),
            'note' => $gd ? 'JPEG ' . (!empty($gdInfo['JPEG Support']) ? 'yes' : 'NO') . ', PNG ' . (!empty($gdInfo['PNG Support']) ? 'yes' : 'NO') : 'Photos cannot be scaled.',
        ];

        $imagick = extension_loaded('imagick');
        $rows[] = ['check' => 'Imagick', 'value' => $imagick ? 'present' : 'absent', 'ok' => true, 'note' => $imagick ? 'CMYK photo conversion possible (PDF/X-1a).' : 'Expected absent on this host; photos stay RGB (PDF/X-4).'];

        $gs = self::ghostscript();
        $rows[] = ['check' => 'Ghostscript', 'value' => $gs ?? 'absent', 'ok' => true, 'note' => $gs !== null ? 'A fallback for a shop that wants PDF/X-1a.' : 'Not needed for PDF/X-4.'];

        $mem = (string) ini_get('memory_limit');
        $memBytes = self::bytes($mem);
        $rows[] = ['check' => 'memory_limit', 'value' => $mem, 'ok' => $memBytes < 0 || $memBytes >= 256 * 1024 * 1024, 'note' => 'An A2 export with two 4800 px photos wants 256 MB or more; exports run on the queue.'];

        $time = (string) ini_get('max_execution_time');
        $rows[] = ['check' => 'max_execution_time', 'value' => $time, 'ok' => true, 'note' => 'CLI and queue workers ignore it; the web request never renders.'];

        $rows[] = ['check' => 'TCPDF', 'value' => class_exists(\TCPDF_STATIC::class) ? \TCPDF_STATIC::getTCPDFVersion() : 'missing', 'ok' => class_exists(\TCPDF_STATIC::class), 'note' => 'composer require tecnickcom/tcpdf'];

        $rows[] = [
            'check' => 'Press ICC profile',
            'value' => $intent->hasProfile() ? basename((string) $intent->profilePath) : 'missing',
            'ok' => $intent->hasProfile(),
            'note' => $intent->hasProfile() ? 'Embedded as the output intent.' : 'Run scripts/install-poster-icc.sh; until then the intent is named by registry only and strict PDF/X-4 preflight flags it.',
        ];

        $rows[] = ['check' => 'sRGB profile (TCPDF)', 'value' => is_file(base_path('vendor/tecnickcom/tcpdf/include/sRGB.icc')) ? 'present' : 'missing', 'ok' => is_file(base_path('vendor/tecnickcom/tcpdf/include/sRGB.icc')), 'note' => 'Tagged into every photo JPEG.'];

        return $rows;
    }

    private static function ghostscript(): ?string
    {
        if (!function_exists('proc_open')) {
            return null;
        }
        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        if (in_array('proc_open', $disabled, true)) {
            return null;
        }
        foreach (['gs', 'gswin64c'] as $bin) {
            $p = @proc_open([$bin, '--version'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
            if (!is_resource($p)) {
                continue;
            }
            $out = trim((string) stream_get_contents($pipes[1]));
            fclose($pipes[1]);
            fclose($pipes[2]);
            $code = proc_close($p);
            if ($code === 0 && $out !== '') {
                return $out;
            }
        }

        return null;
    }

    private static function bytes(string $ini): int
    {
        $ini = trim($ini);
        if ($ini === '' || $ini === '-1') {
            return -1;
        }
        $unit = strtolower(substr($ini, -1));
        $n = (int) $ini;

        return match ($unit) {
            'g' => $n * 1024 * 1024 * 1024,
            'm' => $n * 1024 * 1024,
            'k' => $n * 1024,
            default => $n,
        };
    }
}
