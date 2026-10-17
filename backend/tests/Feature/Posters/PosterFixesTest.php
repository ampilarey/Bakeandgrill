<?php

declare(strict_types=1);

namespace Tests\Feature\Posters;

use App\Domains\Posters\PosterPhoto;
use App\Jobs\ExportPosterJob;
use App\Mail\PosterShopMail;
use App\Models\PosterExport;
use App\Models\PosterOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Posters review, 2026-10-17: the file is made on the queue and the page waits
 * for it, a shop order is emailed once its file is ready, a poster prints the
 * full-size photo (or one uploaded for posters) and never the small web crop,
 * and a mounted poster keeps its corners clear.
 */
class PosterFixesTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private array $files = [];

    protected function tearDown(): void
    {
        foreach ($this->files as $file) {
            @unlink($file);
        }
        parent::tearDown();
    }

    private function notice(array $extra = []): array
    {
        return array_replace([
            'name' => 'Open', 'template_key' => 'plain_notice', 'layout' => 'notice', 'mood' => 'dark', 'language' => 'en',
            'sizes' => ['A5'], 'slots' => ['headline' => 'Open', 'body' => 'Come in'], 'bindings' => [],
        ], $extra);
    }

    public function test_an_export_waits_on_the_queue_and_the_page_can_ask_where_it_stands(): void
    {
        Queue::fake();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $id = $this->postJson('/api/posters', $this->notice())->assertCreated()->json('id');

        $export = $this->postJson("/api/posters/{$id}/export", ['sizes' => ['A5']])->assertStatus(202)->assertJsonPath('status', 'queued');
        Queue::assertPushed(ExportPosterJob::class);
        $this->getJson('/api/posters/exports/' . $export->json('id'))->assertOk()->assertJsonPath('status', 'queued');
        $this->getJson('/api/posters/exports/' . $export->json('id') . '/download')->assertStatus(409);

        // The worker makes it; then the page sees ready and downloads.
        (new ExportPosterJob((int) $export->json('id')))->handle();
        $this->getJson('/api/posters/exports/' . $export->json('id'))->assertOk()->assertJsonPath('status', 'ready');
        $this->get('/api/posters/exports/' . $export->json('id') . '/download')->assertOk();
    }

    public function test_a_shop_order_is_made_on_the_queue_and_emailed_when_its_file_is_ready(): void
    {
        Queue::fake();
        Mail::fake();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $shop = $this->postJson('/api/posters/shops', ['name' => 'Island Press', 'email' => 'press@example.test'])->assertCreated();
        $id = $this->postJson('/api/posters', $this->notice())->assertCreated()->json('id');

        $order = $this->postJson("/api/posters/{$id}/orders", ['supplier_id' => $shop->json('id'), 'sizes' => ['A5']])->assertCreated()
            ->assertJsonPath('state', 'draft')->assertJsonPath('file', 'queued');
        Mail::assertNothingSent();
        Queue::assertPushed(ExportPosterJob::class, fn (ExportPosterJob $job) => $job->orderId === (int) $order->json('id'));

        $exportId = (int) PosterOrder::query()->findOrFail($order->json('id'))->poster_export_id;
        (new ExportPosterJob($exportId, (int) $order->json('id')))->handle();
        $this->assertSame('sent', PosterOrder::query()->findOrFail($order->json('id'))->state);
        Mail::assertSent(PosterShopMail::class);
        $this->assertSame('ready', PosterExport::query()->findOrFail($exportId)->status);
    }

    public function test_a_shop_with_no_email_is_noted_on_the_order_once_the_file_is_ready(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $shop = $this->postJson('/api/posters/shops', ['name' => 'Walk-in press'])->assertCreated();
        $id = $this->postJson('/api/posters', $this->notice())->assertCreated()->json('id');

        $this->postJson("/api/posters/{$id}/orders", ['supplier_id' => $shop->json('id'), 'sizes' => ['A5']])->assertCreated()
            ->assertJsonPath('state', 'draft')->assertJsonPath('file', 'ready');
        $order = PosterOrder::query()->latest('id')->firstOrFail();
        $this->assertStringStartsWith('Not emailed:', (string) collect($order->state_log)->last()['note']);
        Mail::assertNothingSent();
    }

    public function test_a_poster_prints_the_poster_upload_then_the_full_size_original_never_only_the_web_crop(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        // Real files where the menu keeps them (the poster reads the disk, not a fake).
        $put = function (string $dir, int $w, int $h): string {
            $name = $dir . '/poster-test-' . $w . 'x' . $h . '.jpg';
            @mkdir(storage_path('app/public/' . $dir), 0775, true);
            $img = imagecreatetruecolor($w, $h);
            imagejpeg($img, storage_path('app/public/' . $name), 60);
            $this->files[] = storage_path('app/public/' . $name);

            return '/storage/' . $name;
        };
        $item = $this->makeItem(false, 0, ['name' => 'Bajiya', 'image_url' => $put('menu', 1200, 900)]);
        $poster = $this->notice(['template_key' => 'new_dish', 'layout' => 'hero_photo', 'mood' => 'photo', 'sizes' => ['A4'], 'bindings' => ['item_id' => $item->id], 'slots' => []]);

        // Only the web crop: refused for print, with what to do.
        $preview = $this->postJson('/api/posters/preview', $poster)->assertOk();
        $this->assertSame('crop', $preview->json('content.photo_source'));
        $this->assertStringContainsString('only has its small website photo', (string) collect($preview->json('preflight'))->where('level', 'red')->pluck('message')->implode(' '));

        // The dish's full-size original is used once it is there.
        $item->forceFill(['image_original_url' => $put('menu-masters', 3200, 2400)])->save();
        $this->assertSame('master', $this->postJson('/api/posters/preview', $poster)->json('content.photo_source'));

        // A poster upload beats both, kept at 4800 px on the long edge at most.
        $upload = $this->postJson('/api/posters/photo', ['photo' => UploadedFile::fake()->image('big.jpg', 6000, 4000)])->assertCreated()
            ->assertJsonPath('width', 4800)->assertJsonPath('height', 3200);
        $poster['slots']['photo_path'] = $upload->json('photo_path');
        $this->assertSame('upload', $this->postJson('/api/posters/preview', $poster)->json('content.photo_source'));
        $this->assertNull(PosterPhoto::uploadPath('../../.env'));
        @unlink((string) PosterPhoto::uploadPath((string) $upload->json('photo_path')));
    }

    public function test_a_mounted_poster_keeps_its_corners_clear(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $ids = fn (array $job) => collect($this->postJson('/api/posters/preview', $this->notice($job))->json('preflight'))->where('id', 'keepout');
        $this->assertSame([], $ids(['mounting' => 'none'])->all());
        // With stand-offs the layout moves in from the corners, so the logo and QR clear them.
        $this->assertSame('ok', $ids(['mounting' => 'standoffs'])->first()['level'] ?? null);
        $this->assertSame('ok', $ids(['mounting' => 'eyelets', 'sizes' => ['A2']])->first()['level'] ?? null);
    }
}
