<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PruneUnreferencedMediaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_deletes_old_unreferenced_files_and_keeps_referenced(): void
    {
        Storage::disk('public')->put('menu/keep.jpg', 'keep');
        Storage::disk('public')->put('menu/orphan.jpg', 'orphan');
        Storage::disk('public')->put('thumbs/orphan-thumb.jpg', 'orphan');

        // Age the orphan past the retention window.
        $old = now()->subDays(10)->getTimestamp();
        touch(Storage::disk('public')->path('menu/orphan.jpg'), $old);
        touch(Storage::disk('public')->path('thumbs/orphan-thumb.jpg'), $old);
        touch(Storage::disk('public')->path('menu/keep.jpg'), $old);

        Item::factory()->create([
            'image_url' => '/storage/menu/keep.jpg',
        ]);

        Artisan::call('media:prune-unreferenced', ['--days' => 7]);

        $this->assertTrue(Storage::disk('public')->exists('menu/keep.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('menu/orphan.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('thumbs/orphan-thumb.jpg'));
    }

    public function test_dry_run_does_not_delete(): void
    {
        Storage::disk('public')->put('menu/orphan2.jpg', 'x');
        touch(Storage::disk('public')->path('menu/orphan2.jpg'), now()->subDays(30)->getTimestamp());

        Artisan::call('media:prune-unreferenced', ['--days' => 7, '--dry-run' => true]);

        $this->assertTrue(Storage::disk('public')->exists('menu/orphan2.jpg'));
    }
}
