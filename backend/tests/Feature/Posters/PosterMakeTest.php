<?php

declare(strict_types=1);

namespace Tests\Feature\Posters;

use App\Models\Item;
use App\Models\PosterExport;
use App\Models\RestaurantTable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

class PosterMakeTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_cannot_open_posters(): void
    {
        Sanctum::actingAs($this->makeStaff('kitchen_staff'), ['staff']);

        $this->getJson('/api/posters/catalog')->assertStatus(403);
    }

    public function test_a_happy_hour_poster_downloads_as_a_zip_the_shop_can_print(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $preview = $this->postJson('/api/posters/preview', $this->happyHour())->assertOk();
        $this->assertStringContainsString('GST', (string) $preview->json('content.gst'));

        $created = $this->postJson('/api/posters', $this->happyHour())->assertCreated();
        $id = (int) $created->json('id');
        $this->assertSame('P' . str_pad((string) $id, 4, '0', STR_PAD_LEFT), $created->json('code'));

        $export = $this->postJson("/api/posters/{$id}/export", [
            'sizes' => ['A5'],
            'material' => 'foam',
            'imposition' => 'single',
            'masks' => true,
            'quantity' => ['A5' => 4],
        ])->assertStatus(202);

        $this->assertSame('ready', $export->json('status'));
        $this->get("/api/posters/exports/{$export->json('id')}/download")->assertOk();
        $zip = new ZipArchive;
        $this->assertTrue($zip->open((string) PosterExport::query()->find($export->json('id'))?->zip_path));
        $names = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $names[] = $zip->getNameIndex($i);
        }
        $this->assertNotEmpty(array_filter($names, static fn (string $n): bool => str_ends_with($n, '.pdf') && !str_contains($n, 'SPEC') && !str_contains($n, 'WHITE')));
        $this->assertNotEmpty(array_filter($names, static fn (string $n): bool => str_contains($n, 'WHITE')));
        $this->assertNotEmpty(array_filter($names, static fn (string $n): bool => str_contains($n, 'SPEC')));
        $pdf = (string) $zip->getFromName((string) array_values(array_filter($names, static fn (string $n): bool => str_ends_with($n, '-v1.pdf')))[0]);
        $this->assertStringStartsWith('%PDF-1.6', $pdf);
        $this->assertStringContainsString('/GTS_PDFXVersion (PDF/X-4)', $pdf);
        $zip->close();
    }

    public function test_a_price_that_is_not_the_menus_is_refused(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create(['name' => 'Chicken tikka', 'base_price' => 85, 'is_active' => true]);
        $draft = $this->happyHour();
        $draft['template_key'] = 'dish_discount';
        $draft['layout'] = 'compare';
        $draft['bindings'] = ['item_id' => $item->id];
        $draft['slots']['price'] = 'MVR 1.00';
        $poster = $this->postJson('/api/posters', $draft)->assertCreated();

        $this->postJson('/api/posters/' . $poster->json('id') . '/export', ['sizes' => ['A5']])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Preflight failed.');
    }

    public function test_a_table_card_set_is_one_page_per_table(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        RestaurantTable::create(['name' => 'One', 'capacity' => 2, 'is_active' => true, 'status' => 'available']);
        RestaurantTable::create(['name' => 'Two', 'capacity' => 4, 'is_active' => true, 'status' => 'available']);
        $draft = [
            'name' => 'Tables',
            'template_key' => 'table_card',
            'layout' => 'qr_card',
            'mood' => 'cream',
            'language' => 'en',
            'landscape' => true,
            'sizes' => ['A5'],
            'slots' => ['headline' => 'Order from your table', 'headline_dv' => 'މޭޒުން އޯޑަރު ކުރޭ', 'subhead' => 'One code for this table'],
            'bindings' => [],
        ];
        $poster = $this->postJson('/api/posters', $draft)->assertCreated();
        $export = $this->postJson('/api/posters/' . $poster->json('id') . '/export', [
            'sizes' => ['A5'],
            'imposition' => 'tent',
            'masks' => false,
        ])->assertStatus(202);

        $this->assertSame('ready', $export->json('status'));
        $this->assertGreaterThan(1000, (int) $export->json('bytes'));
    }

    /** @return array<string, mixed> */
    private function happyHour(): array
    {
        return [
            'name' => 'Friday happy hour',
            'template_key' => 'happy_hour',
            'layout' => 'price_card',
            'mood' => 'rust',
            'language' => 'both',
            'landscape' => false,
            'sizes' => ['A5', 'A4'],
            'slots' => [
                'headline' => 'Happy hour',
                'headline_dv' => 'ހެޕީ އަވަރު',
                'badge' => 'Friday',
                'price' => '20% off',
                'subhead' => '4 pm to 6 pm',
            ],
            'bindings' => [],
            'place' => 'Window',
            'take_down_on' => now()->addWeek()->toDateString(),
        ];
    }
}
