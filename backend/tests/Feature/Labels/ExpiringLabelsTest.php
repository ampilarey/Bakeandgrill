<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\LabelPrint;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Printed stock near its expiry (2026-10-12): the print log knows what was
 * stickered with which date, so the owners hear once per batch and the
 * Print labels tab lists it with Reprint.
 */
class ExpiringLabelsTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    private Item $gulha;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(['phone' => '9607771234']), ['staff']);
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 3]);
        $this->gulha = $this->makeItem(false, 0, ['name' => 'Gulha', 'label_enabled' => true, 'label_shelf_life_days' => 3]);
        $print = fn (array $a) => LabelPrint::create($a + ['kind' => 'sticker_en', 'layout' => 'a4-4', 'output' => 'print', 'mfg_date' => '2026-10-10']);
        // One batch of Bajiya printed twice, expiring tomorrow.
        $print(['code' => 'BAJ11111', 'item_id' => $this->bajiya->id, 'copies' => 24, 'exp_date' => '2026-10-13', 'batch_code' => '261010']);
        $print(['code' => 'BAJ22222', 'item_id' => $this->bajiya->id, 'copies' => 12, 'exp_date' => '2026-10-13', 'batch_code' => '261010']);
        // Gulha that expired yesterday, and a later Bajiya batch five days out.
        $print(['code' => 'GUL11111', 'item_id' => $this->gulha->id, 'copies' => 30, 'exp_date' => '2026-10-11', 'batch_code' => null]);
        $print(['code' => 'BAJ33333', 'item_id' => $this->bajiya->id, 'copies' => 8, 'exp_date' => '2026-10-17', 'batch_code' => '261014']);
        // Long gone, and a box label: neither counts.
        $print(['code' => 'OLD11111', 'item_id' => $this->gulha->id, 'copies' => 5, 'exp_date' => '2026-10-01']);
        LabelPrint::create(['kind' => 'box_label', 'layout' => 'a4', 'copies' => 1, 'output' => 'print', 'exp_date' => '2026-10-13']);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_the_daily_check_tells_the_owners_once_per_batch(): void
    {
        AlertSwitch::setAll('owner_labels_expiry', true);

        Artisan::call('labels:check-expiring', ['--days' => 2]);

        $this->assertSame(1, SmsLog::query()->where('type', 'owner_labels_expiry')->count());
        $body = (string) SmsLog::query()->where('type', 'owner_labels_expiry')->value('message');
        $this->assertStringContainsString('66 printed pack(s)', $body);
        $this->assertStringContainsString('Gulha ×30 expired yesterday', $body);
        $this->assertStringContainsString('Bajiya ×36 (batch 261010) tomorrow', $body, 'the two prints of one batch are one line');
        $this->assertStringNotContainsString('261014', $body, 'five days out is not within two');
        $this->assertSame(['BAJ11111', 'BAJ22222', 'GUL11111'], LabelPrint::query()->whereNotNull('expiry_alerted_at')->orderBy('code')->pluck('code')->all());

        // The next day's run has nothing new to say.
        CarbonImmutable::setTestNow('2026-10-13 08:10:00');
        Artisan::call('labels:check-expiring', ['--days' => 2]);
        $this->assertSame(1, SmsLog::query()->where('type', 'owner_labels_expiry')->count());

        // A fresh print of the same batch is news again; the group counts all its stock.
        LabelPrint::create(['code' => 'BAJ44444', 'kind' => 'sticker_en', 'layout' => 'a4-4', 'output' => 'print', 'item_id' => $this->bajiya->id, 'copies' => 6, 'mfg_date' => '2026-10-13', 'exp_date' => '2026-10-13', 'batch_code' => '261010']);
        Artisan::call('labels:check-expiring', ['--days' => 2]);
        $this->assertSame(2, SmsLog::query()->where('type', 'owner_labels_expiry')->count());
        $this->assertStringContainsString('Bajiya ×42 (batch 261010) today', (string) SmsLog::query()->where('type', 'owner_labels_expiry')->latest('id')->value('message'));
    }

    public function test_with_the_alert_off_nothing_is_sent_or_marked(): void
    {
        AlertSwitch::setAll('owner_labels_expiry', false);
        Artisan::call('labels:check-expiring', ['--days' => 2]);
        $this->assertSame(0, SmsLog::query()->where('type', 'owner_labels_expiry')->count());
        $this->assertSame(0, LabelPrint::query()->whereNotNull('expiry_alerted_at')->count());
    }

    public function test_the_hub_lists_the_groups_with_reprint_in_mind(): void
    {
        $res = $this->getJson('/api/labels/expiring?days=7')->assertOk()->assertJsonCount(3, 'data');
        $rows = $res->json('data');
        $this->assertSame(['Gulha', 'Bajiya', 'Bajiya'], array_column($rows, 'name'), 'soonest first');
        $this->assertSame([-1, 1, 5], array_column($rows, 'days_left'));
        $this->assertSame([30, 36, 8], array_column($rows, 'copies'));
        $this->assertSame(['BAJ22222', 'BAJ11111'], $rows[1]['codes'], 'the codes, newest first, for the pack pages');
        $this->assertSame('item', $rows[1]['kind']);
        $this->assertSame($this->bajiya->id, $rows[1]['id']);
        $this->assertSame('261010', $rows[1]['batch_code']);
        $this->assertFalse($rows[1]['alerted']);
        $this->assertArrayNotHasKey('print_ids', $rows[1]);

        $this->getJson('/api/labels/expiring?days=2')->assertOk()->assertJsonCount(2, 'data');
        // Staff without Print labels cannot read it.
        Sanctum::actingAs($this->makeStaff(), ['staff']);
        $this->getJson('/api/labels/expiring')->assertForbidden();
    }
}
