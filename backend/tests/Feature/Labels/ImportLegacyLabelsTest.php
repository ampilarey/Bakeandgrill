<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Console\Commands\ImportLegacyLabels;
use App\Models\Item;
use App\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Label Hub, step 5: the owner's nine frozen short eats come across from the
 * Python label project with their lettering, photos and ingredient lines.
 */
class ImportLegacyLabelsTest extends TestCase
{
    use RefreshDatabase;

    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->dir = sys_get_temp_dir() . '/legacy-labels-' . uniqid();
        mkdir($this->dir);
        $n = 0;
        foreach (array_keys(ImportLegacyLabels::PRODUCTS) as $key) {
            foreach (['title', 'food'] as $kind) {
                // A different size per file, or the library dedupes them.
                $img = imagecreatetruecolor(40 + $n++, 20);
                imagesavealpha($img, true);
                imagefill($img, 0, 0, imagecolorallocatealpha($img, 0, 0, 0, 127));
                imagefilledrectangle($img, 5, 5, 35, 15, imagecolorallocate($img, 183, 75, 12));
                imagepng($img, "{$this->dir}/{$key}_{$kind}.png");
            }
        }
    }

    protected function tearDown(): void
    {
        array_map('unlink', glob("{$this->dir}/*") ?: []);
        @rmdir($this->dir);
        parent::tearDown();
    }

    public function test_it_matches_the_menu_items_and_brings_their_art_and_ingredients(): void
    {
        foreach (ImportLegacyLabels::PRODUCTS as [$name]) {
            if ($name !== 'Bis Keemiya') {
                $this->makeItem(false, 0, ['name' => $name]);
            }
        }
        $bajiya = Item::query()->where('name', 'Bajiya')->first();
        $bajiya->update(['name_dv' => 'ބާޖިޔާ (old)']);

        $this->artisan('labels:import-legacy', ['dir' => $this->dir])
            ->expectsOutputToContain('Not matched (rename the menu item or add it, then run again): Bis Keemiya')
            ->assertSuccessful();

        $bajiya->refresh();
        $this->assertTrue($bajiya->label_enabled);
        $this->assertSame('frozen', $bajiya->label_storage);
        $this->assertStringStartsWith('Flour, salt, oil, spices', (string) $bajiya->label_ingredients);
        $this->assertStringStartsWith('ފުށް', (string) $bajiya->label_ingredients_dv);
        $this->assertSame('ބާޖިޔާ (old)', $bajiya->name_dv, 'an existing Dhivehi name is kept');
        $this->assertNotNull($bajiya->label_title_media_id);
        $this->assertNotNull($bajiya->label_photo_media_id);
        $this->assertSame('ހަނޑޫ ގުޅަ', Item::query()->where('name', 'Handoo Gulha')->value('name_dv'));
        $this->assertSame(16, Media::query()->count(), 'eight products × lettering and photo');

        // Running again keeps what is there.
        $this->artisan('labels:import-legacy', ['dir' => $this->dir])->assertSuccessful();
        $this->assertSame(16, Media::query()->count());
        $this->assertSame($bajiya->label_title_media_id, $bajiya->fresh()->label_title_media_id);
    }

    public function test_a_dry_run_changes_nothing_and_a_missing_folder_fails(): void
    {
        $this->makeItem(false, 0, ['name' => 'Bajiya']);
        $this->artisan('labels:import-legacy', ['dir' => $this->dir, '--dry-run' => true])->assertSuccessful();
        $this->assertFalse((bool) Item::query()->where('name', 'Bajiya')->value('label_enabled'));
        $this->assertSame(0, Media::query()->count());

        $this->artisan('labels:import-legacy', ['dir' => '/no/such/folder'])->assertFailed();
    }
}
