<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\LabelJob;
use App\Models\LabelPrint;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Label Hub v2, step 4 (docs/LABEL_HUB_V2_PLAN.md point 10): "created
 * labels must be saved, redownloaded, reprinted, reedited".
 */
class LabelJobsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-04 09:00:00');
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_a_prepared_print_is_saved_once_and_can_be_reprinted_renamed_copied_and_removed(): void
    {
        $bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90]);
        $body = ['items' => [['id' => $bajiya->id, 'copies' => 8]], 'layout' => 'a4-8', 'fill' => true, 'mfg' => '2026-10-04', 'batch' => 'KP-1'];

        $first = $this->postJson('/api/labels/stickers/url', $body)->assertOk()->json('job');
        $this->assertSame('Bajiya ×8 · 8 on A4 · 4 Oct', $first['name']);
        // The same request again is the same saved label, printed twice.
        $again = $this->postJson('/api/labels/stickers/url', $body)->assertOk()->json('job');
        $this->assertSame($first['id'], $again['id']);
        $this->assertSame(1, LabelJob::query()->count());
        $this->assertSame(2, LabelJob::query()->first()->print_count);
        // A preview saves nothing.
        $this->postJson('/api/labels/stickers/url', $body + ['preview' => true])->assertOk()->assertJsonMissingPath('job');
        $this->assertSame(1, LabelJob::query()->count());

        $list = $this->getJson('/api/labels/jobs')->assertOk()->json();
        $this->assertSame(1, $list['total']);
        $this->assertSame('stickers', $list['data'][0]['kind']);
        $this->assertSame(8, $list['data'][0]['summary']['stickers']);

        // Edit: the request comes back as it was sent.
        $this->getJson("/api/labels/jobs/{$first['id']}")->assertOk()
            ->assertJsonPath('data.request.layout', 'a4-8')
            ->assertJsonPath('data.request.batch', 'KP-1')
            ->assertJsonPath('data.request.items.0.copies', 8);

        // Reprint a week later: today's made-on date, expiry worked out again, a new log entry.
        CarbonImmutable::setTestNow('2026-10-11 09:00:00');
        $before = LabelPrint::query()->count();
        $re = $this->postJson("/api/labels/jobs/{$first['id']}/print")->assertOk();
        $this->assertSame('2026-10-11', $re->json('summary.products.0.mfg'));
        $this->assertSame('2027-01-09', $re->json('summary.products.0.exp'));
        $this->assertStringContainsString('signature=', $re->json('pdf_url'));
        $this->assertSame($before + 1, LabelPrint::query()->count());
        $this->assertSame(3, LabelJob::query()->first()->print_count);

        // Rename, copy, remove.
        $this->putJson("/api/labels/jobs/{$first['id']}", ['name' => 'Friday bajiya run'])->assertOk()->assertJsonPath('data.name', 'Friday bajiya run');
        $copy = $this->postJson("/api/labels/jobs/{$first['id']}/duplicate")->assertCreated()->json('data');
        $this->assertSame('Friday bajiya run (copy)', $copy['name']);
        $this->assertSame(0, $copy['print_count']);
        $this->assertSame('KP-1', $copy['request']['batch']);
        $this->deleteJson("/api/labels/jobs/{$copy['id']}")->assertOk();
        $this->assertSame(1, LabelJob::query()->count());

        // A saved label whose stock no longer exists is refused, not crashed.
        LabelJob::query()->whereKey($first['id'])->update(['request' => json_encode(array_merge($body, ['layout' => 'gone']))]);
        $this->postJson("/api/labels/jobs/{$first['id']}/print")->assertUnprocessable();
    }

    public function test_a_box_label_is_saved_too_and_the_permission_is_needed(): void
    {
        $patties = $this->makeItem(false, 0, ['name' => 'Patties']);
        $res = $this->postJson('/api/labels/box/url', ['customer' => 'NH Kuda Rah', 'storage' => 'chilled', 'lines' => [['id' => $patties->id, 'qty' => 20, 'article' => 'FROZEN - SHORT EAT - PATTIES-PIECE']]])->assertOk();
        $this->assertSame('Box label · NH Kuda Rah · 4 Oct', $res->json('job.name'));
        $this->assertSame([['name' => 'Patties', 'qty' => 20]], $res->json('summary.lines'));
        $job = LabelJob::query()->where('kind', 'box')->firstOrFail();
        $this->postJson("/api/labels/jobs/{$job->id}/print")->assertOk()->assertJsonPath('summary.customer', 'NH Kuda Rah');
        $this->assertStringContainsString('KEEP CHILLED', (string) $this->get($this->postJson("/api/labels/jobs/{$job->id}/print")->json('view_url'))->getContent());

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $this->getJson('/api/labels/jobs')->assertForbidden();
        $this->postJson("/api/labels/jobs/{$job->id}/print")->assertForbidden();
    }
}
