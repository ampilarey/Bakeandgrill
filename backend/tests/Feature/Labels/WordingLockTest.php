<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\LabelPrint;
use App\Models\LabelSignoff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The wording lock (round 17 of the usability work, owner, 2026-10-13: "a
 * wording lock with sign-off for legal lines, plus the print log already
 * kept"): a product's legal lines are signed off as they stand; a change
 * shows which lines moved; with the lock on only signed-off wording prints;
 * every print records the sign-off it printed under.
 */
class WordingLockTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(['name' => 'Aminath']), ['staff']);
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90, 'label_ingredients_source' => 'manual', 'label_ingredients' => 'Flour, egg, tuna', 'allergens' => ['egg']]);
    }

    private function print(array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4'] + $extra);
    }

    public function test_lines_are_signed_off_a_change_shows_and_the_lock_prints_only_signed_wording(): void
    {
        $status = $this->getJson("/api/labels/signoffs/item/{$this->bajiya->id}")->assertOk();
        $status->assertJsonPath('data.state', 'none')->assertJsonPath('data.lines.ingredients', 'Flour, egg, tuna')->assertJsonPath('data.lines.allergens', 'egg')->assertJsonPath('data.printable', true);
        $this->assertStringContainsString('KEEP FROZEN', (string) $status->json('data.lines.storage'));

        // Unlocked, an unsigned product prints and the log says it printed under no sign-off.
        $this->print()->assertOk();
        $this->assertNull(LabelPrint::query()->latest('id')->firstOrFail()->details);

        // Locked: refused with the reason until signed off; a preview still draws.
        $this->putJson('/api/labels/settings', ['label_wording_lock' => '1'])->assertOk();
        $this->print()->assertUnprocessable()->assertJsonPath('message', 'The wording is locked: Bajiya has legal lines not signed off as they stand. Sign them off on the label first, or turn the lock off under Labels → Settings.');
        $this->print(['preview' => true])->assertOk();
        $this->getJson("/api/labels/signoffs/item/{$this->bajiya->id}")->assertJsonPath('data.printable', false)->assertJsonPath('data.locked', true);

        $signed = $this->postJson("/api/labels/signoffs/item/{$this->bajiya->id}", ['note' => 'Checked against the recipe'])->assertCreated();
        $signed->assertJsonPath('data.state', 'signed')->assertJsonPath('data.signed.by', 'Aminath')->assertJsonPath('data.signed.note', 'Checked against the recipe')->assertJsonPath('data.printable', true);
        $this->print()->assertOk();
        $this->assertSame(LabelSignoff::query()->value('id'), LabelPrint::query()->latest('id')->firstOrFail()->details['signoff']);

        // A changed ingredient list shows which line moved and locks the print again.
        $this->putJson("/api/items/{$this->bajiya->id}/label", ['label_ingredients' => 'Flour, egg, tuna, chilli'])->assertOk();
        $this->getJson("/api/labels/signoffs/item/{$this->bajiya->id}")->assertJsonPath('data.state', 'changed')->assertJsonPath('data.changed', ['ingredients', 'ingredients_dv'])
            ->assertJsonPath('data.signed.lines.ingredients', 'Flour, egg, tuna')->assertJsonPath('data.printable', false);
        $this->print()->assertUnprocessable();
        $this->postJson("/api/labels/signoffs/item/{$this->bajiya->id}")->assertCreated()->assertJsonPath('data.state', 'signed');
        $this->print()->assertOk();
        $this->assertCount(2, $this->getJson("/api/labels/signoffs/item/{$this->bajiya->id}/history")->assertOk()->json('data'));

        // The list says where every product stands.
        $this->getJson('/api/labels/signoffs')->assertOk()->assertJsonPath('locked', true)->assertJsonPath('data.0.name', 'Bajiya')->assertJsonPath('data.0.state', 'signed');
    }

    public function test_reading_needs_print_labels_and_signing_needs_manage_label_settings(): void
    {
        $manager = $this->makeManager();
        $manager->grantPermission('labels.print');
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $this->getJson("/api/labels/signoffs/item/{$this->bajiya->id}")->assertOk();
        $this->postJson("/api/labels/signoffs/item/{$this->bajiya->id}")->assertForbidden();
        $this->getJson('/api/labels/signoffs/item/999999')->assertNotFound();
        $manager->grantPermission('labels.manage');
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $this->postJson("/api/labels/signoffs/item/{$this->bajiya->id}")->assertCreated();
    }
}
