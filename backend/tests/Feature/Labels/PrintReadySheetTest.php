<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\LabelJob;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Print-ready sheets (round C, 2026-10-12): crop marks at every label's
 * corners for a print shop's trimmer, and a bleed around a single label.
 */
class PrintReadySheetTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function links(array $body): array
    {
        return $this->postJson('/api/labels/stickers/url', $body)->assertOk()->json();
    }

    private function sheet(array $body): string
    {
        return (string) $this->get($this->links($body)['view_url'])->assertOk()->getContent();
    }

    public function test_crop_marks_replace_the_dashed_cut_lines_and_stay_on_the_page(): void
    {
        $one = ['items' => [['id' => $this->bajiya->id, 'copies' => 4]], 'layout' => 'a4-4'];
        $plain = $this->sheet($one);
        $this->assertStringContainsString('class="cut"', $plain);
        $this->assertStringNotContainsString('crop-mark', $plain);

        $html = $this->sheet($one + ['marks' => true]);
        $this->assertStringNotContainsString('class="cut"', $html, 'the dashed lines go when the marks come');
        preg_match_all('/data-testid="crop-mark" style="left:(-?[\d.]+)mm;top:(-?[\d.]+)mm;width:([\d.]+)mm;height:([\d.]+)mm;"/', $html, $m, PREG_SET_ORDER);
        $this->assertGreaterThan(8, count($m), 'ticks at the corners of four labels');
        foreach ($m as [, $left, $top, $w, $h]) {
            $this->assertGreaterThanOrEqual(0, (float) $left);
            $this->assertGreaterThanOrEqual(0, (float) $top);
            $this->assertLessThanOrEqual(210, (float) $left + (float) $w);
            $this->assertLessThanOrEqual(297, (float) $top + (float) $h);
            $this->assertTrue((float) $w === 0.15 || (float) $h === 0.15, 'a hairline');
        }
        // A sheet of several labels takes no bleed: the page stays A4.
        $this->assertStringContainsString('@page { size: 210mm 297mm', $this->sheet($one + ['marks' => true, 'bleed' => 5]));
    }

    public function test_a_single_label_grows_by_its_bleed_on_every_side(): void
    {
        $one = ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'single-custom', 'w' => 40, 'h' => 60];
        $this->assertStringContainsString('@page { size: 40mm 60mm', $this->sheet($one + ['bleed' => 5]), 'a bleed without marks is no bleed');

        $links = $this->links($one + ['marks' => true, 'bleed' => 5]);
        $html = (string) $this->get($links['view_url'])->assertOk()->getContent();
        $this->assertStringContainsString('@page { size: 50mm 70mm', $html);
        $this->assertSame(8, substr_count($html, 'data-testid="crop-mark"'), 'two ticks at each corner, all with room');
        $this->assertStringContainsString('data-testid="crop-mark" style="left:1mm;top:4.925mm;width:3mm;height:0.15mm;"', $html, 'the top-left tick ends 1 mm short of the label');
        $this->assertSame('application/pdf', $this->get($links['pdf_url'])->assertOk()->headers->get('content-type'));

        // A bleed is at most 5 mm, and a tick is cut short when the bleed leaves it less room.
        $this->postJson('/api/labels/stickers/url', $one + ['marks' => true, 'bleed' => 9])->assertUnprocessable();
        $short = $this->sheet($one + ['marks' => true, 'bleed' => 2]);
        $this->assertStringContainsString('@page { size: 44mm 64mm', $short);
        $this->assertStringContainsString('style="left:0mm;top:1.925mm;width:1mm;height:0.15mm;"', $short);

        $job = LabelJob::query()->latest('id')->firstOrFail();
        $this->assertTrue((bool) $job->request['marks']);
        $this->assertSame(2, (int) $job->request['bleed']);
    }
}
