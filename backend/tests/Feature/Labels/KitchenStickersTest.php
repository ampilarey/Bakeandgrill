<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\LabelPrint;
use App\Models\ProductionPlanRecord;
use App\Models\Role;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Print when packing (round 12 of the labels usability work, owner,
 * 2026-10-13: "a Labels button on the kitchen board for the batch just
 * made"): a plan task carries the batches made for it, whichever device or
 * sign-in made them, so the kitchen screen offers each batch's stickers;
 * they print on the roll and in the language picked under Labels →
 * Settings, 4 × 6 cm in English until something is picked.
 */
class KitchenStickersTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    private const DAY = '2026-10-13';

    private User $owner;

    private User $cook;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['owner' => 'Owner', 'manager' => 'Manager', 'staff' => 'Staff', 'kitchen_staff' => 'Kitchen Staff'] as $slug => $name) {
            Role::firstOrCreate(['slug' => $slug], ['name' => $name, 'is_active' => true]);
        }
        PermissionCatalogSync::sync();
        Carbon::setTestNow(Carbon::parse(self::DAY . ' 15:00:00', config('app.timezone')));
        $this->owner = $this->makeOwner(['name' => 'Owner']);
        $this->cook = $this->makeKitchenStaff(['name' => 'Aishath']);
        $this->cook->grantPermission('labels.print');
        $this->cook = $this->cook->fresh();
        $this->bajiya = Item::factory()->prepared(0)->create(['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function plan(): ProductionPlanRecord
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/production-plan/commit', [
            'date' => self::DAY,
            'lines' => [[
                'item_id' => $this->bajiya->id, 'variant_id' => 0,
                'slot_start' => 18, 'slot_end' => 22, 'slot_label' => 'Evening',
                'forecast_qty' => 45, 'planned_qty' => 50, 'assigned_to' => $this->cook->id,
            ]],
        ])->assertOk()->assertJsonPath('saved', 1);

        return ProductionPlanRecord::query()->firstOrFail();
    }

    public function test_a_task_carries_the_batches_made_for_it_and_their_stickers_print_on_the_kitchens_roll_and_language(): void
    {
        $record = $this->plan();

        // Nothing made yet: no batches, and the kitchen prints the default sticker in English.
        Sanctum::actingAs($this->cook, ['staff']);
        $this->getJson('/api/production-plan/tasks?date=' . self::DAY)->assertOk()->assertJsonPath('tasks.0.batches', []);
        $this->getJson('/api/labels/layouts')->assertOk()
            ->assertJsonPath('kitchen.size.layout', 'a4-custom')->assertJsonPath('kitchen.size.name', '40 × 60 mm, 21 on A4')->assertJsonPath('kitchen.size.roll', null)->assertJsonPath('kitchen.lang', 'en');

        // The cook sends 30, then 20: the answer and the day's list both carry the batches, newest first.
        $first = $this->postJson("/api/production-plan/tasks/{$record->id}/made", ['qty' => 30])->assertCreated();
        $pi = (int) $first->json('batch.items.0.id');
        $batchNo = (string) $first->json('batch.batch_no');
        $first->assertJsonPath('task.batches.0.pi', $pi)->assertJsonPath('task.batches.0.batch_no', $batchNo)->assertJsonPath('task.batches.0.qty', 30)->assertJsonPath('task.batches.0.status', 'produced');
        $this->postJson("/api/production-plan/tasks/{$record->id}/made", ['qty' => 20])->assertCreated();
        $task = $this->getJson('/api/production-plan/tasks?date=' . self::DAY)->assertOk()->json('tasks.0');
        $this->assertCount(2, $task['batches']);
        $this->assertEquals(20, $task['batches'][0]['qty']);
        $this->assertSame($pi, $task['batches'][1]['pi']);
        $this->assertSame($batchNo, $task['batches'][1]['batch_no']);
        $this->assertNotNull($task['batches'][1]['made_at']);

        // Labels → Settings picks the kitchen's roll and language.
        Sanctum::actingAs($this->owner, ['staff']);
        $rolls = [
            ['id' => 'small', 'name' => 'Small roll', 'shape' => 'rect', 'preset' => 'r60x40', 'on' => 'printer'],
            ['id' => 'lids', 'name' => 'Jar lids', 'shape' => 'circle', 'preset' => 'c60', 'on' => 'sheet'],
        ];
        $this->putJson('/api/labels/settings', ['label_rolls' => json_encode($rolls), 'label_kitchen_roll' => 'small', 'label_kitchen_lang' => 'both'])->assertOk()
            ->assertJsonPath('data.label_kitchen_roll', 'small')->assertJsonPath('data.label_kitchen_lang', 'both');
        $this->putJson('/api/labels/settings', ['label_kitchen_lang' => 'klingon'])->assertUnprocessable();

        Sanctum::actingAs($this->cook, ['staff']);
        $layouts = $this->getJson('/api/labels/layouts')->assertOk()
            ->assertJsonPath('kitchen.size.layout', 'single-custom')->assertJsonPath('kitchen.size.name', '60 × 40 mm, label printer')->assertJsonPath('kitchen.size.roll', 'small')->assertJsonPath('kitchen.lang', 'both');
        $this->assertEquals(60, $layouts->json('kitchen.size.w'));
        $this->assertEquals(40, $layouts->json('kitchen.size.h'));

        // The batch's sticker defaults carry the same, with its number, dates and count; and they print.
        $defaults = $this->getJson("/api/labels/production-items/{$pi}")->assertOk()
            ->assertJsonPath('data.qty', 30)->assertJsonPath('data.batch', $batchNo)->assertJsonPath('data.item.id', $this->bajiya->id)
            ->assertJsonPath('data.size.layout', 'single-custom')->assertJsonPath('data.size.roll', 'small')->assertJsonPath('data.lang', 'both');
        $res = $this->postJson('/api/labels/stickers/url', [
            'items' => [['id' => $this->bajiya->id, 'copies' => 30]], 'layout' => 'single-custom', 'w' => 60, 'h' => 40, 'lang' => 'both', 'fill' => true,
            'mfg' => $defaults->json('data.mfg'), 'exp' => $defaults->json('data.exp'), 'batch' => $batchNo, 'pi' => $pi,
        ])->assertOk()->assertJsonPath('summary.stickers', 30)->assertJsonPath('summary.products.0.batch', $batchNo)->assertJsonPath('summary.products.0.mfg', self::DAY);
        $this->assertStringContainsString('60 × 40', (string) $res->json('summary.label'));
        $print = LabelPrint::query()->firstOrFail();
        $this->assertSame($pi, $print->kitchen_production_item_id);
        $this->assertSame('sticker_both', $print->kind);
        $this->assertSame($batchNo, $print->batch_code);

        // A round roll prints on the round layout with its diameter; a roll that is gone falls back to the default.
        Sanctum::actingAs($this->owner, ['staff']);
        $this->putJson('/api/labels/settings', ['label_kitchen_roll' => 'lids'])->assertOk();
        $round = $this->getJson('/api/labels/layouts')->assertOk()->assertJsonPath('kitchen.size.layout', 'a4-round-custom')->assertJsonPath('kitchen.size.h', null)->assertJsonPath('kitchen.size.roll', 'lids');
        $this->assertEquals(60, $round->json('kitchen.size.w'));
        $this->putJson('/api/labels/settings', ['label_rolls' => json_encode([$rolls[0]])])->assertOk();
        $this->getJson('/api/labels/layouts')->assertOk()->assertJsonPath('kitchen.size.layout', 'a4-custom')->assertJsonPath('kitchen.size.roll', null)->assertJsonPath('kitchen.lang', 'both');
    }

    public function test_the_kitchen_card_says_before_the_tap_when_the_wording_lock_refuses_its_stickers(): void
    {
        $record = $this->plan();
        Sanctum::actingAs($this->cook, ['staff']);
        $this->postJson("/api/production-plan/tasks/{$record->id}/made", ['qty' => 30])->assertCreated();
        $this->getJson('/api/production-plan/tasks?date=' . self::DAY)->assertOk()->assertJsonPath('tasks.0.stickers_locked', null);

        // Label audit, Batch B: with the lock on and nothing signed off, the card carries the refusal's words.
        Sanctum::actingAs($this->owner, ['staff']);
        $this->putJson('/api/labels/settings', ['label_wording_lock' => '1'])->assertOk();
        Sanctum::actingAs($this->cook, ['staff']);
        $locked = (string) $this->getJson('/api/production-plan/tasks?date=' . self::DAY)->assertOk()->json('tasks.0.stickers_locked');
        $this->assertStringStartsWith('The wording is locked: ', $locked);
    }
}
