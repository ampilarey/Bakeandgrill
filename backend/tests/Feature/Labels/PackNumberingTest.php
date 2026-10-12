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
 * Pack numbering (round C, 2026-10-12): "Pack 3 of 40" on each sticker of a
 * run, on the full, compact and small designs, kept by the saved label.
 */
class PackNumberingTest extends TestCase
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

    private function sheet(array $body): string
    {
        $res = $this->postJson('/api/labels/stickers/url', $body)->assertOk();

        return (string) $this->get($res->json('view_url'))->assertOk()->getContent();
    }

    public function test_each_copy_is_numbered_on_every_design_and_the_saved_label_keeps_it(): void
    {
        $three = ['items' => [['id' => $this->bajiya->id, 'copies' => 3]]];
        $plain = $this->sheet($three + ['layout' => 'a4-4']);
        $this->assertStringNotContainsString('PACK 1 OF 3', $plain);
        $this->assertSame(3, substr_count($plain, 'data-testid="sticker"'));

        $html = $this->sheet($three + ['layout' => 'a4-4', 'number' => true]);
        $this->assertSame(3, substr_count($html, 'data-testid="sticker"'), 'still one sticker a copy');
        foreach ([1, 2, 3] as $n) {
            $this->assertSame(1, substr_count($html, ">PACK {$n} OF 3<"), "pack {$n} once");
        }

        $compact = $this->sheet($three + ['layout' => 'a4-8', 'number' => true]);
        $this->assertStringContainsString('· PACK 2/3<', $compact, 'the compact sticker numbers its batch line');

        $small = $this->sheet($three + ['layout' => 'single-custom', 'w' => 40, 'h' => 60, 'number' => true]);
        $this->assertStringContainsString('· 2/3<', $small, 'the small sticker numbers its batch line');
        $this->assertStringContainsString('· 3/3<', $small);

        $job = LabelJob::query()->latest('id')->firstOrFail();
        $this->assertTrue((bool) $job->request['number']);
        $again = (string) $this->get($this->postJson("/api/labels/jobs/{$job->id}/print")->assertOk()->json('view_url'))->getContent();
        $this->assertStringContainsString('· 1/3<', $again);
    }
}
