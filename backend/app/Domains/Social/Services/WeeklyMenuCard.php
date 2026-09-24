<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * The week's specials as one picture (owner's shortlist, 2026-09-24),
 * 1200x630 so Instagram takes it and link previews show it large. Brand
 * header, up to six lines of "dish — price — days", the site link in the
 * footer. Drawn with GD and the bundled A Faruma face (Thaana + Latin),
 * DejaVu Sans Bold from dompdf for the Latin headline when present.
 *
 * Best-effort: any failure returns null and the automation posts nothing
 * rather than a broken picture.
 */
class WeeklyMenuCard
{
    public const WIDTH = 1200;

    public const HEIGHT = 630;

    private const DIRECTORY = 'social-cards';

    /**
     * @param list<array{name: string, name_dv: ?string, price: string, when: string, badge: ?string}> $lines
     * @return string|null public URL of the JPEG
     */
    public function render(string $title, string $subtitle, array $lines, string $footer, string $cacheKey): ?string
    {
        if (!function_exists('imagecreatetruecolor') || !function_exists('imagettftext')) {
            return null;
        }
        $font = $this->fontFile();
        $bold = $this->boldFontFile() ?? $font;
        if ($font === null) {
            return null;
        }

        try {
            $img = imagecreatetruecolor(self::WIDTH, self::HEIGHT);
            $bg = imagecolorallocate($img, 28, 20, 8);
            $cream = imagecolorallocate($img, 255, 248, 240);
            $accent = imagecolorallocate($img, 212, 129, 58);
            $muted = imagecolorallocate($img, 201, 184, 166);
            imagefilledrectangle($img, 0, 0, self::WIDTH, self::HEIGHT, $bg);
            imagefilledrectangle($img, 0, 0, 14, self::HEIGHT, $accent);

            imagettftext($img, 40, 0, 60, 90, $cream, $bold, $title);
            imagettftext($img, 20, 0, 60, 130, $muted, $font, $subtitle);
            imageline($img, 60, 150, self::WIDTH - 60, 150, $accent);

            $y = 205;
            $rows = array_slice($lines, 0, 6);
            $rowH = count($rows) > 4 ? 62 : 74;
            $size = count($rows) > 4 ? 22 : 26;
            foreach ($rows as $line) {
                $name = $line['name'] . (!empty($line['badge']) ? '  ·  ' . $line['badge'] : '');
                imagettftext($img, $size, 0, 60, $y, $cream, $bold, $name);
                if (!empty($line['name_dv'])) {
                    $box = imagettfbbox($size - 4, 0, $font, $line['name_dv']);
                    $w = abs($box[4] - $box[0]);
                    imagettftext($img, $size - 4, 0, self::WIDTH - 60 - 260 - $w - 24, $y, $muted, $font, $line['name_dv']);
                }
                $priceBox = imagettfbbox($size, 0, $bold, $line['price']);
                $priceW = abs($priceBox[4] - $priceBox[0]);
                imagettftext($img, $size, 0, self::WIDTH - 60 - $priceW, $y, $accent, $bold, $line['price']);
                imagettftext($img, 15, 0, 60, $y + 24, $muted, $font, $line['when']);
                $y += $rowH;
            }
            if (count($lines) > 6) {
                imagettftext($img, 16, 0, 60, $y, $muted, $font, '+ ' . (count($lines) - 6) . ' more on the menu');
            }

            imagettftext($img, 18, 0, 60, self::HEIGHT - 40, $accent, $bold, $footer);

            ob_start();
            imagejpeg($img, null, 86);
            $binary = ob_get_clean();
            imagedestroy($img);
            if (!is_string($binary) || $binary === '') {
                return null;
            }

            $relative = self::DIRECTORY . '/weekly-' . $cacheKey . '.jpg';
            Storage::disk('public')->put($relative, $binary);

            return url('storage/' . $relative);
        } catch (\Throwable $e) {
            Log::warning('social: weekly card render failed', ['error' => $e->getMessage()]);

            return null;
        }
    }

    private function fontFile(): ?string
    {
        foreach ([
            public_path('fonts/a_faruma.ttf'),
            base_path('vendor/dompdf/dompdf/lib/fonts/DejaVuSans.ttf'),
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        ] as $candidate) {
            if (is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private function boldFontFile(): ?string
    {
        foreach ([
            base_path('vendor/dompdf/dompdf/lib/fonts/DejaVuSans-Bold.ttf'),
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        ] as $candidate) {
            if (is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }
}
