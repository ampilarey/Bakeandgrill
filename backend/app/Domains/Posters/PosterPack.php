<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Models\Poster;
use App\Models\RestaurantTable;
use RuntimeException;
use ZipArchive;

/**
 * The ZIP the shop gets: one print PDF per paper size (imposed), the white
 * mask and the gloss mask when asked, and the spec sheet. A screen size
 * gives a PNG at the screen's exact pixels instead of a PDF.
 */
final class PosterPack
{
    /**
     * @param array<string, mixed> $job
     * @return array{bytes: string, preflight: array<string, list<array<string, mixed>>>, blocked: bool}
     */
    public static function make(Poster $poster, array $job): array
    {
        $sizes = array_values(array_filter(
            is_array($job['sizes'] ?? null) ? $job['sizes'] : (array) $poster->sizes,
            static fn ($s): bool => is_string($s) && PaperSize::isKnown($s),
        ));
        if ($sizes === []) {
            $sizes = [is_string($poster->theme) && $poster->theme !== '' && PaperSize::kindOf((string) (((array) $poster->sizes)[0] ?? '')) === PaperSize::KIND_SCREEN ? 'TV' : 'A4'];
        }
        $job['sizes'] = $sizes;

        $preflight = [];
        $blocked = false;
        $pages = [];
        foreach ($sizes as $sizeName) {
            $paper = PaperSize::named($sizeName, (bool) $poster->landscape)->mounted((string) ($job['mounting'] ?? 'none'));
            $sheets = self::sheets($poster, $paper);
            $checks = PosterPreflight::check($poster->toArray(), self::content($poster), $sheets[0], $paper, $job);
            $preflight[$sizeName] = $checks;
            $blocked = $blocked || PosterPreflight::blocked($checks);
            $pages[$sizeName] = [$paper, $sheets];
        }
        if ($blocked) {
            return ['bytes' => '', 'preflight' => $preflight, 'blocked' => true];
        }
        if (!class_exists(ZipArchive::class)) {
            throw new RuntimeException('PHP zip is required to pack a poster.');
        }

        $tmp = tempnam(sys_get_temp_dir(), 'poster-zip');
        $zip = new ZipArchive;
        if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Could not open the poster ZIP.');
        }
        $material = (string) ($job['material'] ?? 'foam');
        $imposition = (string) ($job['imposition'] ?? 'single');
        foreach ($pages as $sizeName => [$paper, $sheets]) {
            if ($paper->isScreen()) {
                // A screen takes a picture at its own pixels, drawn from the same piece list as the preview.
                [$pxW, $pxH] = $paper->pixels();
                foreach ($sheets as $i => $built) {
                    $name = sprintf('BG-%s-%s-%dx%d-v%d%s.png', $poster->code(), $sizeName, $pxW, $pxH, $poster->version, $i > 0 ? '-' . ($i + 1) : '');
                    $zip->addFromString($name, self::png($built, $pxW, $pxH));
                }

                continue;
            }
            $plan = PosterImposition::plan($paper, $imposition);
            $renderSheets = [];
            foreach ($sheets as $built) {
                $copies = [];
                foreach ($plan['copies'] as $copy) {
                    $copies[] = $copy + ['built' => $built];
                }
                $renderSheets[] = $copies;
            }
            $glossOn = strtolower((string) ($job['gloss'] ?? 'none')) !== 'none';
            $rendered = PosterPdf::render($plan['page'], $renderSheets, $poster->name, [
                'mirror' => (bool) ($job['mirror'] ?? (PosterPreflight::MATERIALS[$material]['mirror'] ?? false)),
                'spots' => ($job['layers'] ?? 'masks') === 'spots' ? [
                    'white' => (string) ($job['white_name'] ?? ''),
                    'gloss' => $glossOn ? (string) ($job['gloss_name'] ?? '') : '',
                ] : [],
            ]);
            $base = sprintf('BG-%s-%s-%s-v%d', $poster->code(), $sizeName, $material, $poster->version);
            $zip->addFromString($base . '.pdf', $rendered['pdf']);
            if (($job['masks'] ?? false) === true) {
                $zip->addFromString($base . '-WHITE.pdf', PosterPdf::mask($plan['page'], $rendered['masks'], $poster->code() . ' white'));
                if (strtolower((string) ($job['gloss'] ?? 'none')) !== 'none') {
                    $zip->addFromString($base . '-GLOSS.pdf', PosterPdf::mask($plan['page'], $rendered['gloss'], $poster->code() . ' gloss'));
                }
            }
        }
        $zip->addFromString('BG-' . $poster->code() . '-SPEC.pdf', PosterSpec::render($poster, $job, $preflight));
        $zip->close();
        $bytes = (string) file_get_contents($tmp);
        @unlink($tmp);

        return ['bytes' => $bytes, 'preflight' => $preflight, 'blocked' => false];
    }

    /**
     * A screen picture: the piece list drawn with GD at the screen's pixels (PosterThemeRaster).
     *
     * @param array<string, mixed> $built
     */
    public static function png(array $built, int $pxW, int $pxH): string
    {
        $image = PosterThemeRaster::draw($built, $pxW, $pxH);
        ob_start();
        imagepng($image, null, 6);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);
        if ($bytes === '') {
            throw new RuntimeException('The screen picture came out empty.');
        }

        return $bytes;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function sheets(Poster $poster, PaperSize $paper): array
    {
        $bindings = is_array($poster->bindings) ? $poster->bindings : [];
        $tables = [];
        if ($poster->template_key === 'table_card' && empty($bindings['table_id'])) {
            try {
                $tables = RestaurantTable::query()->where('is_active', true)->orderBy('name')->get()->all();
            } catch (\Throwable) {
                $tables = [];
            }
        }
        if ($tables === []) {
            return [PosterPieces::build($poster->toArray(), $paper, self::content($poster))];
        }
        $sheets = [];
        foreach ($tables as $table) {
            $sheets[] = PosterPieces::build(
                $poster->toArray(),
                $paper,
                PosterContent::resolve($poster->toArray(), (int) $table->id),
            );
        }

        return $sheets;
    }

    /** @return array<string, mixed> */
    private static function content(Poster $poster): array
    {
        return PosterContent::resolve($poster->toArray());
    }
}
