<?php

declare(strict_types=1);

namespace Tests\Feature\Console;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * Phase 0 of docs/POSTER_PLAN.md § 13: the spike command writes the A3
 * poster, its white mask, the swatch card and a report the owner sends
 * to the shop.
 */
class PostersSpikeCommandTest extends TestCase
{
    private string $out;

    protected function setUp(): void
    {
        parent::setUp();
        $this->out = sys_get_temp_dir() . '/bg-poster-spike-' . uniqid();
        config()->set('posters.font_cache', sys_get_temp_dir() . '/bg-poster-fonts-test');
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->out);
        parent::tearDown();
    }

    public function test_it_writes_the_phase_0_files_and_a_report(): void
    {
        $this->artisan('posters:spike', ['--out' => $this->out, '--size' => 'A5', '--skip-a2' => true])
            ->assertSuccessful();

        foreach (['BG-POSTER-SPIKE-A5-foam-v1.pdf', 'BG-POSTER-SPIKE-A5-foam-v1-WHITE.pdf', 'BG-SWATCH-A5-v1.pdf', 'spike-report.json'] as $file) {
            $this->assertFileExists("{$this->out}/{$file}");
        }
        $this->assertStringStartsWith('%PDF-1.6', (string) file_get_contents("{$this->out}/BG-POSTER-SPIKE-A5-foam-v1.pdf"));

        $report = json_decode((string) file_get_contents("{$this->out}/spike-report.json"), true);
        $this->assertIsArray($report);
        $this->assertSame('A5', $report['poster']['size']);
        $this->assertArrayHasKey('ppi', $report['poster']['photo']);
        $this->assertArrayNotHasKey('a2', $report);
        $this->assertNotEmpty(array_filter($report['host'], static fn (array $row): bool => $row['check'] === 'TCPDF' && $row['ok']));
    }
}
