<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelRolls;
use App\Domains\Permissions\PermissionCatalogSync;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * My label rolls (round 6 of the usability work, owner, 2026-10-13: "only
 * the sizes you own"): the rolls and sheets the business owns, kept as one
 * setting, tidied on the way in, and sent with the layouts so every size
 * picker can show them first.
 */
class LabelRollsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    public function test_rolls_are_kept_tidied_and_sent_with_the_layouts(): void
    {
        $this->getJson('/api/labels/layouts')->assertOk()->assertJsonPath('rolls', []);

        $rolls = [
            ['id' => 'big', 'name' => '  Big sheets  ', 'shape' => 'rect', 'preset' => 'r105x148', 'on' => 'precut'],
            ['id' => 'small', 'name' => 'Small roll', 'shape' => 'rect', 'preset' => 'custom', 'on' => 'printer', 'w' => 60, 'h' => 40.04],
            ['id' => 'lids', 'name' => 'Lids', 'shape' => 'circle', 'preset' => 'c60', 'on' => 'landscape'],
            // Too small to print, an unknown preset, a shape that does not match its preset, and a repeat id: dropped.
            ['id' => 'tiny', 'name' => 'Tiny', 'shape' => 'rect', 'preset' => 'custom', 'on' => 'sheet', 'w' => 10, 'h' => 10],
            ['id' => 'odd', 'name' => 'Odd', 'shape' => 'rect', 'preset' => 'r999x999', 'on' => 'sheet'],
            ['id' => 'wrong', 'name' => 'Wrong', 'shape' => 'circle', 'preset' => 'r105x148', 'on' => 'sheet'],
            ['id' => 'big', 'name' => 'Again', 'shape' => 'rect', 'preset' => 'r105x148', 'on' => 'sheet'],
            'not a roll',
        ];
        $kept = $this->putJson('/api/labels/settings', ['label_rolls' => json_encode($rolls)])->assertOk()->json('data.label_rolls');
        $list = json_decode($kept, true);
        $this->assertSame(['big', 'small', 'lids'], array_column($list, 'id'));
        $this->assertSame(['Big sheets', 'Small roll', 'Lids'], array_column($list, 'name'));
        // A preset roll takes the preset's size; a typed size is rounded; a stock the size does not offer falls back.
        // (assertEquals: JSON carries 105.0 as 105.)
        $this->assertEquals(['shape' => 'rect', 'preset' => 'r105x148', 'on' => 'precut', 'w' => 105.0, 'h' => 148.5], array_intersect_key($list[0], array_flip(['shape', 'preset', 'on', 'w', 'h'])));
        $this->assertEquals(['preset' => 'custom', 'on' => 'printer', 'w' => 60.0, 'h' => 40.0], array_intersect_key($list[1], array_flip(['preset', 'on', 'w', 'h'])));
        $this->assertEquals(['shape' => 'circle', 'preset' => 'c60', 'on' => 'sheet', 'w' => 60.0, 'h' => 60.0], array_intersect_key($list[2], array_flip(['shape', 'preset', 'on', 'w', 'h'])));

        $this->getJson('/api/labels/layouts')->assertOk()->assertJsonPath('rolls.0.name', 'Big sheets')->assertJsonPath('rolls.2.preset', 'c60')->assertJsonCount(3, 'rolls');
        $this->assertCount(3, LabelRolls::all());

        // Not a list: refused; nothing: none.
        $this->putJson('/api/labels/settings', ['label_rolls' => 'not json'])->assertStatus(422);
        $this->putJson('/api/labels/settings', ['label_rolls' => ''])->assertOk()->assertJsonPath('data.label_rolls', '');
        $this->getJson('/api/labels/layouts')->assertOk()->assertJsonPath('rolls', []);

        // At most twenty, and a roll without an id gets one.
        $many = array_map(fn (int $i) => ['name' => "Roll $i", 'shape' => 'rect', 'preset' => 'custom', 'on' => 'sheet', 'w' => 40 + $i, 'h' => 30], range(1, 25));
        $list = json_decode($this->putJson('/api/labels/settings', ['label_rolls' => json_encode($many)])->assertOk()->json('data.label_rolls'), true);
        $this->assertCount(LabelRolls::MAX, $list);
        $this->assertMatchesRegularExpression('/^roll-[0-9a-f]{8}$/', $list[0]['id']);
    }
}
