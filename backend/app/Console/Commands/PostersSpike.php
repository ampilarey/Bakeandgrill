<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Posters\LogoVector;
use App\Domains\Posters\PaperSize;
use App\Domains\Posters\Pdf\OutputIntent;
use App\Domains\Posters\Spike\HeroPoster;
use App\Domains\Posters\Spike\HostCheck;
use App\Domains\Posters\Spike\SwatchCard;
use App\Domains\Posters\Spike\WhiteMask;
use Illuminate\Console\Command;
use Throwable;

/**
 * php artisan posters:spike
 *
 * Phase 0 of docs/POSTER_PLAN.md (§ 13): makes the files the print shop
 * gets for the first real order and reports what the host can do.
 *
 *   BG-POSTER-SPIKE-A3-foam-v1.pdf        the A3 hero_photo poster, PDF/X-4
 *   BG-POSTER-SPIKE-A3-foam-v1-WHITE.pdf  its white-ink mask
 *   BG-SWATCH-A5-v1.pdf                   the brand colour swatch card
 *   spike-report.json                     host check, timings, photo ppi
 *
 * Also writes the still logo SVGs (public/brand/logo.svg, logo-dark.svg)
 * with --logo-svg, and times a worst-case A2 unless --skip-a2.
 */
class PostersSpike extends Command
{
    protected $signature = 'posters:spike
        {--out= : Folder for the files (default storage/app/posters/spike)}
        {--photo= : A JPEG or PNG to use instead of the stand-in picture}
        {--size=A3 : A5, A4, A3 or A2 for the poster}
        {--logo-svg : Also write public/brand/logo.svg and logo-dark.svg}
        {--skip-a2 : Do not time the worst-case A2 export}';

    protected $description = 'Posters Phase 0: make the PDF/X-4 test poster, its white mask and the swatch card; check the host';

    public function handle(): int
    {
        $out = rtrim((string) ($this->option('out') ?: storage_path('app/posters/spike')), '/');
        if (!is_dir($out) && !@mkdir($out, 0775, true) && !is_dir($out)) {
            $this->components->error("Cannot make {$out}");

            return self::FAILURE;
        }
        $intent = OutputIntent::fromConfig();
        $report = ['made_at' => now()->toIso8601String(), 'out' => $out, 'intent' => $intent->identifier, 'profile_embedded' => $intent->hasProfile()];

        $this->components->info('Host check');
        $host = HostCheck::run($intent);
        foreach ($host as $row) {
            $this->components->twoColumnDetail($row['check'] . ($row['ok'] ? '' : '  (!)'), $row['value'] . ($row['note'] !== '' ? '  — ' . $row['note'] : ''));
        }
        $report['host'] = $host;

        $data = $this->sampleData((string) $this->option('photo'));

        $sizeName = strtoupper((string) $this->option('size'));
        $this->components->info("Poster, {$sizeName}");
        try {
            $size = PaperSize::named($sizeName);
            $t0 = microtime(true);
            $result = (new HeroPoster($size, $data, $intent))->render();
            $secs = microtime(true) - $t0;
            $name = "BG-POSTER-SPIKE-{$sizeName}-foam-v1";
            file_put_contents("{$out}/{$name}.pdf", $result['pdf']);
            $mask = WhiteMask::render($size, $result['ink'], $intent, "White mask, {$sizeName}");
            file_put_contents("{$out}/{$name}-WHITE.pdf", $mask);
            $this->components->twoColumnDetail('File', "{$name}.pdf  (" . $this->kb(strlen($result['pdf'])) . ')');
            $this->components->twoColumnDetail('White mask', "{$name}-WHITE.pdf  (" . $this->kb(strlen($mask)) . ')');
            $this->components->twoColumnDetail('Photo', "{$result['photo']['w']} × {$result['photo']['h']} px, {$result['photo']['ppi']} ppi over the bleed" . $this->ppiNote($size, (float) $result['photo']['ppi']));
            $this->components->twoColumnDetail('Time', sprintf('%.2f s, peak %s', $secs, $this->kb(memory_get_peak_usage(true))));
            $report['poster'] = ['size' => $sizeName, 'file' => "{$name}.pdf", 'bytes' => strlen($result['pdf']), 'mask_bytes' => strlen($mask), 'seconds' => round($secs, 2), 'photo' => $result['photo']];
        } catch (Throwable $e) {
            $this->components->error('Poster failed: ' . $e->getMessage());
            $report['poster_error'] = $e->getMessage();
        }

        $this->components->info('Swatch card');
        try {
            $t0 = microtime(true);
            $card = SwatchCard::render($intent, now()->format('j M Y'));
            file_put_contents("{$out}/BG-SWATCH-A5-v1.pdf", $card);
            $this->components->twoColumnDetail('File', 'BG-SWATCH-A5-v1.pdf  (' . $this->kb(strlen($card)) . ')');
            $report['swatch'] = ['file' => 'BG-SWATCH-A5-v1.pdf', 'bytes' => strlen($card), 'seconds' => round(microtime(true) - $t0, 2)];
        } catch (Throwable $e) {
            $this->components->error('Swatch card failed: ' . $e->getMessage());
            $report['swatch_error'] = $e->getMessage();
        }

        if (!$this->option('skip-a2') && $sizeName !== 'A2') {
            $this->components->info('Worst case: A2 timing');
            try {
                $size = PaperSize::named('A2');
                $before = memory_get_peak_usage(true);
                $t0 = microtime(true);
                $result = (new HeroPoster($size, $data, $intent))->render();
                $secs = microtime(true) - $t0;
                file_put_contents("{$out}/BG-POSTER-SPIKE-A2-foam-v1.pdf", $result['pdf']);
                $this->components->twoColumnDetail('A2', sprintf('%.2f s, %s, peak %s (was %s)', $secs, $this->kb(strlen($result['pdf'])), $this->kb(memory_get_peak_usage(true)), $this->kb($before)));
                $this->components->twoColumnDetail('Photo', "{$result['photo']['w']} × {$result['photo']['h']} px, {$result['photo']['ppi']} ppi" . $this->ppiNote($size, (float) $result['photo']['ppi']));
                $report['a2'] = ['seconds' => round($secs, 2), 'bytes' => strlen($result['pdf']), 'peak_bytes' => memory_get_peak_usage(true), 'photo' => $result['photo']];
            } catch (Throwable $e) {
                $this->components->error('A2 failed: ' . $e->getMessage());
                $report['a2_error'] = $e->getMessage();
            }
        }

        if ($this->option('logo-svg')) {
            $this->components->info('Still logo SVGs');
            try {
                $logo = LogoVector::fromFile();
                file_put_contents(public_path('brand/logo.svg'), $logo->stillSvg('light'));
                file_put_contents(public_path('brand/logo-dark.svg'), $logo->stillSvg('dark'));
                $this->components->twoColumnDetail('Written', 'public/brand/logo.svg, public/brand/logo-dark.svg (' . count($logo->shapes()) . ' paths)');
            } catch (Throwable $e) {
                $this->components->error('Logo SVG failed: ' . $e->getMessage());
            }
        }

        file_put_contents("{$out}/spike-report.json", json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $this->newLine();
        $this->components->info("Files in {$out}");
        if (!$intent->hasProfile()) {
            $this->components->warn('No press ICC profile on disk: the output intent is named by registry only. Run scripts/install-poster-icc.sh before the first real order.');
        }

        return isset($report['poster_error']) ? self::FAILURE : self::SUCCESS;
    }

    /** @return array<string, string> */
    private function sampleData(string $photo): array
    {
        $gst = 'Prices include GST';
        $gstDv = 'އަގުތަކުގައި ޖީއެސްޓީ ހިމެނޭ';
        try {
            $svc = app(GstSettingsService::class);
            if (!$svc->taxInclusive()) {
                $pct = rtrim(rtrim(number_format($svc->defaultTaxRatePercent(), 2), '0'), '.');
                $gst = "GST {$pct}% is added";
                $gstDv = "ޖީއެސްޓީ {$pct}% އިތުރުވާނެ";
            }
        } catch (Throwable) {
            // No database here: the default wording stands.
        }

        return [
            'eyebrow' => 'New on the menu',
            'headline' => 'Chicken Tikka Platter',
            'headline_dv' => 'ޗިކަން ޓިކާ ޕްލެޓަރ',
            'price' => 'From MVR 85.00',
            'gst_line' => $gst,
            'gst_line_dv' => $gstDv,
            'qr_url' => 'https://bakeandgrill.mv/menu',
            'photo' => $photo,
        ];
    }

    private function ppiNote(PaperSize $size, float $ppi): string
    {
        if ($ppi < PaperSize::PPI_RED) {
            return '  RED: under ' . PaperSize::PPI_RED;
        }
        if ($ppi < $size->amberPpi()) {
            return '  amber: under ' . $size->amberPpi();
        }

        return '  ok';
    }

    private function kb(int $bytes): string
    {
        return $bytes >= 1024 * 1024 ? sprintf('%.1f MB', $bytes / 1024 / 1024) : sprintf('%d KB', (int) round($bytes / 1024));
    }
}
