<?php

declare(strict_types=1);

namespace App\Domains\Content;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;

/**
 * Validate, store, and emit CSS for the owner-uploaded Dhivehi webfont.
 *
 * Serving model matches Akuru: woff2 preferred, Thaana unicode-range,
 * shipped A_Faruma remains the fallback. env() is never used here.
 */
final class DhivehiFont
{
    public const FAMILY = 'BakeDhivehi';

    public const DEFAULT_STACK = "'A_Faruma', 'MV Faseyha', 'MV Waheed', serif";

    public const UNICODE_RANGE = 'U+0780-U+07BF';

    public const THAANA_START = 0x0780;

    public const THAANA_END = 0x07BF;

    public const MAX_BYTES = 2_097_152;

    public const CONTENT_KEY = 'dhivehi_font';

    /**
     * @return array{url: string, format: string, bytes: int}
     */
    public static function storeUpload(UploadedFile $file): array
    {
        $bytes = (string) file_get_contents($file->getRealPath() ?: '');
        if ($bytes === '' || strlen($bytes) > self::MAX_BYTES) {
            throw new InvalidArgumentException('Font file is empty or larger than 2 MB.');
        }

        $kind = self::detectKind($bytes);
        if ($kind === null) {
            throw new InvalidArgumentException('That file is not a real font (TTF, OTF, WOFF or WOFF2).');
        }

        self::assertHasThaana($bytes, $kind, $file->getRealPath() ?: '');

        $stored = self::maybeConvertToWoff2($bytes, $kind);
        $ext = $stored['ext'];
        $payload = $stored['bytes'];
        $hash = hash('sha256', $payload);
        $relative = "fonts/{$hash}.{$ext}";

        Storage::disk('public')->put($relative, $payload);

        return [
            'url' => '/storage/' . $relative,
            'format' => $ext === 'ttf' ? 'truetype' : ($ext === 'otf' ? 'opentype' : $ext),
            'bytes' => strlen($payload),
        ];
    }

    public static function stylesheet(string $app = 'website'): string
    {
        if (!in_array($app, ContentRegistry::APPS, true)) {
            $app = 'website';
        }

        $url = trim((string) ContentResolver::for($app)->get(self::CONTENT_KEY, ''));
        if ($url === '' || !self::isSafePublicUrl($url)) {
            return "/* default A_Faruma — no custom Dhivehi font */\n";
        }

        $format = self::cssFormatFromUrl($url);
        $version = substr(hash('sha256', $url), 0, 12);
        $src = $url . (str_contains($url, '?') ? '&' : '?') . 'v=' . $version;
        $family = self::FAMILY;
        $range = self::UNICODE_RANGE;
        $stack = self::DEFAULT_STACK;

        return <<<CSS
@font-face {
  font-family: '{$family}';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('{$src}') format('{$format}');
  unicode-range: {$range};
}
:root {
  --font-dhivehi: '{$family}', {$stack};
}

CSS;
    }

    public static function isSafePublicUrl(string $url): bool
    {
        if (str_starts_with($url, '/storage/fonts/')) {
            return (bool) preg_match('#^/storage/fonts/[A-Za-z0-9._-]+$#', $url);
        }

        return false;
    }

    public static function cssFormatFromUrl(string $url): string
    {
        $path = strtolower((string) parse_url($url, PHP_URL_PATH));

        return match (true) {
            str_ends_with($path, '.woff2') => 'woff2',
            str_ends_with($path, '.woff') => 'woff',
            str_ends_with($path, '.otf') => 'opentype',
            default => 'truetype',
        };
    }

    public static function detectKind(string $bytes): ?string
    {
        if (strlen($bytes) < 4) {
            return null;
        }
        $magic = substr($bytes, 0, 4);

        return match ($magic) {
            'wOF2' => 'woff2',
            'wOFF' => 'woff',
            'OTTO' => 'otf',
            "\x00\x01\x00\x00", 'true', 'typ1' => 'ttf',
            default => null,
        };
    }

    /**
     * @return list<int>
     */
    public static function thaanaCodepoints(string $bytes, string $kind): array
    {
        if (in_array($kind, ['ttf', 'otf'], true)) {
            return self::thaanaFromSfntCmap($bytes);
        }

        return self::thaanaViaFonttoolsTemp($bytes, $kind);
    }

    private static function assertHasThaana(string $bytes, string $kind, string $path): void
    {
        $cps = self::thaanaCodepoints($bytes, $kind);
        if ($cps === [] && in_array($kind, ['woff', 'woff2'], true) && $path !== '') {
            $cps = self::thaanaViaFonttoolsPath($path);
        }
        if ($cps === []) {
            throw new InvalidArgumentException(
                'This font has no Thaana (Dhivehi) letters. Upload a Thaana-capable TTF, OTF, WOFF or WOFF2.',
            );
        }
    }

    /**
     * @return array{bytes: string, ext: string}
     */
    private static function maybeConvertToWoff2(string $bytes, string $kind): array
    {
        if ($kind === 'woff2') {
            return ['bytes' => $bytes, 'ext' => 'woff2'];
        }

        $converted = self::convertSfntToWoff2($bytes);
        if ($converted !== null) {
            return ['bytes' => $converted, 'ext' => 'woff2'];
        }

        $ext = match ($kind) {
            'woff' => 'woff',
            'otf' => 'otf',
            default => 'ttf',
        };

        return ['bytes' => $bytes, 'ext' => $ext];
    }

    private static function convertSfntToWoff2(string $bytes): ?string
    {
        $python = self::pythonBin();
        if ($python === null) {
            return null;
        }

        $tmp = tempnam(sys_get_temp_dir(), 'dvfont');
        if ($tmp === false) {
            return null;
        }
        file_put_contents($tmp, $bytes);
        $out = $tmp . '.woff2';
        $script = <<<'PY'
import sys
from fontTools.ttLib import TTFont
src, dest = sys.argv[1], sys.argv[2]
font = TTFont(src)
font.flavor = "woff2"
font.save(dest)
PY;
        $cmd = sprintf(
            '%s -c %s %s %s 2>/dev/null',
            escapeshellarg($python),
            escapeshellarg($script),
            escapeshellarg($tmp),
            escapeshellarg($out),
        );
        exec($cmd, $ignored, $code);
        $result = ($code === 0 && is_file($out)) ? (string) file_get_contents($out) : null;
        @unlink($tmp);
        @unlink($out);

        return ($result !== null && $result !== '') ? $result : null;
    }

    /**
     * @return list<int>
     */
    private static function thaanaViaFonttoolsTemp(string $bytes, string $kind): array
    {
        $tmp = tempnam(sys_get_temp_dir(), 'dvfont');
        if ($tmp === false) {
            return [];
        }
        file_put_contents($tmp, $bytes);
        $cps = self::thaanaViaFonttoolsPath($tmp);
        @unlink($tmp);

        return $cps;
    }

    /**
     * @return list<int>
     */
    private static function thaanaViaFonttoolsPath(string $path): array
    {
        $python = self::pythonBin();
        if ($python === null || $path === '' || !is_file($path)) {
            return [];
        }
        $script = <<<'PY'
import sys
from fontTools.ttLib import TTFont
font = TTFont(sys.argv[1])
cmap = font.getBestCmap() or {}
print(" ".join(str(c) for c in cmap if 0x0780 <= c <= 0x07BF))
PY;
        $cmd = sprintf('%s -c %s %s 2>/dev/null', escapeshellarg($python), escapeshellarg($script), escapeshellarg($path));
        $out = trim((string) shell_exec($cmd));
        if ($out === '') {
            return [];
        }

        return array_values(array_filter(array_map('intval', preg_split('/\s+/', $out) ?: []), static fn (int $n) => $n > 0));
    }

    private static function pythonBin(): ?string
    {
        $bin = trim((string) shell_exec('command -v python3 2>/dev/null'));
        if ($bin === '') {
            return null;
        }
        exec(escapeshellarg($bin) . ' -c "import fontTools" 2>/dev/null', $ignored, $code);

        return $code === 0 ? $bin : null;
    }

    /**
     * Minimal SFNT cmap reader (format 4 + 12) — enough to require Thaana.
     *
     * @return list<int>
     */
    private static function thaanaFromSfntCmap(string $bytes): array
    {
        if (strlen($bytes) < 12) {
            return [];
        }
        $numTables = unpack('n', substr($bytes, 4, 2))[1] ?? 0;
        $cmapOff = null;
        for ($i = 0; $i < $numTables; $i++) {
            $entry = substr($bytes, 12 + ($i * 16), 16);
            if (strlen($entry) < 16) {
                break;
            }
            if (substr($entry, 0, 4) === 'cmap') {
                $cmapOff = unpack('N', substr($entry, 8, 4))[1] ?? null;
                break;
            }
        }
        if (!is_int($cmapOff) || $cmapOff < 0 || $cmapOff + 4 > strlen($bytes)) {
            return [];
        }

        $numEnc = unpack('n', substr($bytes, $cmapOff + 2, 2))[1] ?? 0;
        $found = [];
        for ($i = 0; $i < $numEnc; $i++) {
            $rec = substr($bytes, $cmapOff + 4 + ($i * 8), 8);
            if (strlen($rec) < 8) {
                break;
            }
            $platform = unpack('n', substr($rec, 0, 2))[1] ?? 0;
            $encoding = unpack('n', substr($rec, 2, 2))[1] ?? 0;
            $subOff = unpack('N', substr($rec, 4, 4))[1] ?? 0;
            $isUnicode = $platform === 0 || ($platform === 3 && in_array($encoding, [1, 10], true));
            if (!$isUnicode) {
                continue;
            }
            $abs = $cmapOff + $subOff;
            $format = unpack('n', substr($bytes, $abs, 2))[1] ?? 0;
            $found = array_merge($found, match ($format) {
                4 => self::cmapFormat4($bytes, $abs),
                12 => self::cmapFormat12($bytes, $abs),
                default => [],
            });
        }

        $found = array_values(array_unique($found));
        sort($found);

        return $found;
    }

    /**
     * @return list<int>
     */
    private static function cmapFormat4(string $bytes, int $abs): array
    {
        if ($abs + 14 > strlen($bytes)) {
            return [];
        }
        $segCountX2 = unpack('n', substr($bytes, $abs + 6, 2))[1] ?? 0;
        $segCount = intdiv($segCountX2, 2);
        if ($segCount < 1 || $segCount > 2048) {
            return [];
        }
        $endOff = $abs + 14;
        $startOff = $endOff + $segCountX2 + 2;
        $out = [];
        for ($i = 0; $i < $segCount; $i++) {
            $end = unpack('n', substr($bytes, $endOff + ($i * 2), 2))[1] ?? 0;
            $start = unpack('n', substr($bytes, $startOff + ($i * 2), 2))[1] ?? 0;
            $from = max($start, self::THAANA_START);
            $to = min($end, self::THAANA_END);
            for ($cp = $from; $cp <= $to; $cp++) {
                $out[] = $cp;
            }
        }

        return $out;
    }

    /**
     * @return list<int>
     */
    private static function cmapFormat12(string $bytes, int $abs): array
    {
        if ($abs + 16 > strlen($bytes)) {
            return [];
        }
        $nGroups = unpack('N', substr($bytes, $abs + 12, 4))[1] ?? 0;
        if ($nGroups < 1 || $nGroups > 4096) {
            return [];
        }
        $out = [];
        for ($i = 0; $i < $nGroups; $i++) {
            $g = substr($bytes, $abs + 16 + ($i * 12), 12);
            if (strlen($g) < 12) {
                break;
            }
            $start = unpack('N', substr($g, 0, 4))[1] ?? 0;
            $end = unpack('N', substr($g, 4, 4))[1] ?? 0;
            $from = max($start, self::THAANA_START);
            $to = min($end, self::THAANA_END);
            for ($cp = $from; $cp <= $to; $cp++) {
                $out[] = $cp;
            }
        }

        return $out;
    }
}
