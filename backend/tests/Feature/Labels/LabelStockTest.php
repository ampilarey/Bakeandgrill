<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelRolls;
use App\Domains\Labels\RollStockAlert;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\LabelJob;
use App\Models\SmsLog;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Label stock (round 13 of the usability work, owner, 2026-10-13: "how many
 * labels are left on each roll, with a warning when low"): a roll can carry
 * how many are left and the level that warns; a print counts labels off a
 * printer roll and sheets off a sheet stock, the pickers show what is left,
 * and the owners hear once when a roll reaches its level.
 */
class LabelStockTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(['name' => 'Owner', 'phone' => '9607771234']), ['staff']);
        CarbonImmutable::setTestNow('2026-10-13 09:00:00');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90]);
        $this->putJson('/api/labels/settings', ['label_rolls' => json_encode([
            ['id' => 'small', 'name' => 'Small roll', 'shape' => 'rect', 'preset' => 'r60x40', 'on' => 'printer', 'left' => 60, 'low' => 50],
            ['id' => 'sheets', 'name' => 'A4 sheets', 'shape' => 'rect', 'preset' => 'r105x148', 'on' => 'sheet', 'left' => 3, 'low' => 2],
            ['id' => 'lids', 'name' => 'Jar lids', 'shape' => 'circle', 'preset' => 'c60', 'on' => 'sheet'],
        ])])->assertOk();
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /** @return array<string, mixed> */
    private function roll(string $id): array
    {
        foreach (LabelRolls::presentAll() as $roll) {
            if ($roll['id'] === $id) {
                return $roll;
            }
        }
        $this->fail("No roll {$id}");
    }

    public function test_rolls_carry_their_stock_and_the_pickers_see_what_is_left(): void
    {
        $rolls = $this->getJson('/api/labels/layouts')->assertOk()->json('rolls');
        $this->assertSame([60, 3, null], array_column($rolls, 'left'));
        $this->assertSame([50, 2, null], array_column($rolls, 'low'));
        $this->assertSame(['labels', 'sheets', 'sheets'], array_column($rolls, 'unit'));
        $this->assertSame([false, false, false], array_column($rolls, 'low_now'));
        $this->assertSame([false, false, false], array_column($rolls, 'out'));
        // A number that is not one, or below none, is tidied; a roll at or under its level says so.
        $kept = json_decode($this->putJson('/api/labels/settings', ['label_rolls' => json_encode([
            ['id' => 'a', 'shape' => 'rect', 'preset' => 'r60x40', 'on' => 'printer', 'left' => -4, 'low' => 'ten'],
            ['id' => 'b', 'shape' => 'rect', 'preset' => 'r60x40', 'on' => 'printer', 'left' => 12, 'low' => 20, 'low_alerted_at' => '2026-10-12T08:00:00+05:00'],
            ['id' => 'c', 'shape' => 'rect', 'preset' => 'r60x40', 'on' => 'printer', 'left' => 30, 'low' => 20, 'low_alerted_at' => '2026-10-12T08:00:00+05:00'],
        ])])->assertOk()->json('data.label_rolls'), true);
        $this->assertSame([0, 12, 30], array_column($kept, 'left'));
        $this->assertSame([null, 20, 20], array_column($kept, 'low'));
        $this->assertSame([null, '2026-10-12T08:00:00+05:00', null], array_column($kept, 'low_alerted_at'), 'counted up above the level, the telling is forgotten');
        $rolls = $this->getJson('/api/labels/layouts')->assertOk()->json('rolls');
        $this->assertSame([false, true, false], array_column($rolls, 'low_now'));
        $this->assertSame([true, false, false], array_column($rolls, 'out'));
    }

    public function test_a_print_counts_labels_off_a_printer_roll_or_sheets_off_a_sheet_stock_and_warns_the_owners_once(): void
    {
        AlertSwitch::setAll(RollStockAlert::TYPE, true);

        // Named by the request: 8 stickers off the small roll.
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 8]], 'layout' => 'single-custom', 'w' => 60, 'h' => 40, 'roll' => 'small'])->assertOk();
        $res->assertJsonPath('summary.roll.id', 'small')->assertJsonPath('summary.roll.left', 52)->assertJsonPath('summary.roll.took', 8)->assertJsonPath('summary.roll.unit', 'labels')->assertJsonPath('summary.roll.low_now', false);
        $this->assertSame(52, $this->roll('small')['left']);
        $this->assertSame(0, SmsLog::query()->where('type', RollStockAlert::TYPE)->count());
        // The saved label keeps the roll, so printing it again counts it off too.
        $this->assertSame('small', LabelJob::query()->latest('id')->firstOrFail()->request['roll']);

        // Not named: the roll of that very size and stock is found; the drop to the level tells the owners once.
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 2]], 'layout' => 'single-custom', 'w' => 60, 'h' => 40])->assertOk();
        $res->assertJsonPath('summary.roll.id', 'small')->assertJsonPath('summary.roll.left', 50)->assertJsonPath('summary.roll.low_now', true);
        $this->assertSame(1, SmsLog::query()->where('type', RollStockAlert::TYPE)->count());
        $body = (string) SmsLog::query()->where('type', RollStockAlert::TYPE)->value('message');
        $this->assertStringContainsString('Small roll (60 × 40 mm, label printer) is down to 50 labels (warning at 50)', $body);
        $this->assertStringContainsString('Labels → Settings → My label rolls', $body);
        $this->assertNotNull($this->roll('small')['low_alerted_at']);
        // Further prints keep counting down, never below none, and say nothing more.
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 70]], 'layout' => 'single-custom', 'w' => 60, 'h' => 40, 'roll' => 'small'])->assertOk()
            ->assertJsonPath('summary.roll.left', 0)->assertJsonPath('summary.roll.out', true);
        $this->assertSame(1, SmsLog::query()->where('type', RollStockAlert::TYPE)->count());

        // A sheet stock counts sheets: 5 stickers at 4 a sheet is 2 sheets.
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 5]], 'layout' => 'a4-4', 'roll' => 'sheets'])->assertOk();
        $res->assertJsonPath('summary.roll.id', 'sheets')->assertJsonPath('summary.roll.left', 1)->assertJsonPath('summary.roll.took', 2)->assertJsonPath('summary.roll.unit', 'sheets')->assertJsonPath('summary.roll.low_now', true);
        $this->assertSame(2, SmsLog::query()->where('type', RollStockAlert::TYPE)->count());
        $this->assertStringContainsString('A4 sheets (4 on A4) is down to 1 sheet (warning at 2)', (string) SmsLog::query()->where('type', RollStockAlert::TYPE)->latest('id')->value('message'));

        // A roll that is not counted is left alone; a size no roll matches counts nothing; a preview counts nothing.
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 3]], 'layout' => 'a4-round-custom', 'w' => 60, 'roll' => 'lids'])->assertOk()
            ->assertJsonPath('summary.roll.id', 'lids')->assertJsonPath('summary.roll.left', null)->assertJsonPath('summary.roll.took', 1);
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 3]], 'layout' => 'a4-12'])->assertOk()->assertJsonPath('summary.roll', null);
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 3]], 'layout' => 'a4-4', 'roll' => 'sheets', 'preview' => true])->assertOk()->assertJsonPath('summary.roll', null);
        $this->assertSame(1, $this->roll('sheets')['left']);

        // Counted up again above the level, the roll warns again when it next drops.
        $rolls = LabelRolls::all();
        $rolls[0]['left'] = 200;
        $this->putJson('/api/labels/settings', ['label_rolls' => json_encode($rolls)])->assertOk();
        $this->assertNull($this->roll('small')['low_alerted_at']);
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 160]], 'layout' => 'single-custom', 'w' => 60, 'h' => 40, 'roll' => 'small'])->assertOk()->assertJsonPath('summary.roll.left', 40);
        $this->assertSame(3, SmsLog::query()->where('type', RollStockAlert::TYPE)->count());
    }

    public function test_with_the_alert_off_the_count_still_runs_and_nothing_is_sent_or_remembered(): void
    {
        AlertSwitch::setAll(RollStockAlert::TYPE, false);
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 20]], 'layout' => 'single-custom', 'w' => 60, 'h' => 40, 'roll' => 'small'])->assertOk()
            ->assertJsonPath('summary.roll.left', 40)->assertJsonPath('summary.roll.low_now', true);
        $this->assertSame(0, SmsLog::query()->where('type', RollStockAlert::TYPE)->count());
        $this->assertNull($this->roll('small')['low_alerted_at'], 'nobody was told, so a later switch-on tells them at the next print');
        $this->assertStringContainsString('the label roll 60 × 40 mm, label printer is down to 1 label', RollStockAlert::message(['id' => 'x', 'name' => '', 'shape' => 'rect', 'preset' => 'r60x40', 'on' => 'printer', 'w' => 60.0, 'h' => 40.0, 'left' => 1, 'low' => 0]));
    }

    public function test_two_rolls_of_one_size_are_never_guessed_between(): void
    {
        // Label audit, Batch C: a second 60 × 40 printer roll.
        $this->putJson('/api/labels/settings', ['label_rolls' => json_encode([
            ['id' => 'small', 'name' => 'Small roll', 'shape' => 'rect', 'preset' => 'r60x40', 'on' => 'printer', 'left' => 60, 'low' => 5],
            ['id' => 'spare', 'name' => 'Spare roll', 'shape' => 'rect', 'preset' => 'r60x40', 'on' => 'printer', 'left' => 100],
        ])])->assertOk();
        $req = LabelRolls::request(LabelRolls::find('small'));
        $print = fn (array $extra = []) => $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 4]], 'layout' => $req['layout'], 'w' => $req['w'], 'h' => $req['h']] + $extra)->assertOk();

        // None named: neither is counted, and the summary names both so the screen asks.
        $print()->assertJsonPath('summary.roll', null)->assertJsonPath('summary.roll_unsure', ['Small roll', 'Spare roll']);
        $this->assertSame([60, 100], [$this->roll('small')['left'], $this->roll('spare')['left']]);
        $print(['preview' => true])->assertJsonPath('summary.roll_unsure', ['Small roll', 'Spare roll']);

        // Named: that one comes off, and only that one.
        $print(['roll' => 'spare'])->assertJsonPath('summary.roll.id', 'spare')->assertJsonPath('summary.roll.left', 96)->assertJsonPath('summary.roll_unsure', []);
        $this->assertSame([60, 96], [$this->roll('small')['left'], $this->roll('spare')['left']]);

        // A roll named for another size is not counted against this print.
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 4]], 'layout' => 'a4-4', 'roll' => 'small'])->assertOk()->assertJsonPath('summary.roll', null);
        $this->assertSame(60, $this->roll('small')['left']);
    }

    public function test_the_count_is_read_fresh_under_a_lock_so_no_print_is_lost(): void
    {
        // Label audit, Batch C: the count comes from the database row, not a stale cached copy.
        $req = LabelRolls::request(LabelRolls::find('small'));
        $before = LabelRolls::presentAll();
        \App\Models\SiteSetting::query()->where('key', LabelRolls::KEY)->update(['value' => json_encode([['id' => 'small', 'name' => 'Small roll', 'shape' => 'rect', 'preset' => 'r60x40', 'on' => 'printer', 'left' => 40, 'low' => 5]])]);
        $this->assertSame(60, $before[0]['left']);
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 3]], 'layout' => $req['layout'], 'w' => $req['w'], 'h' => $req['h'], 'roll' => 'small'])->assertOk()->assertJsonPath('summary.roll.left', 37);
        $this->assertSame(37, $this->roll('small')['left']);
    }
}
