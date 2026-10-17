<?php

declare(strict_types=1);

namespace Tests\Feature\Posters;

use App\Domains\Posters\PaperSize;
use App\Domains\Posters\PosterContent;
use App\Domains\Posters\PosterPieces;
use App\Domains\Posters\PosterPurposes;
use App\Domains\Signage\Services\SignageResolver;
use App\Domains\Social\Services\SocialPostingRules;
use App\Models\Poster;
use App\Models\PosterScan;
use App\Models\SignagePlaylist;
use App\Models\SiteSetting;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosterEverywhereTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_scan_opens_the_page_and_counts_without_personal_data(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $id = $this->postJson('/api/posters', [
            'name' => 'How we did',
            'template_key' => 'how_we_did',
            'layout' => 'qr_card',
            'sizes' => ['A5'],
            'take_down_on' => now()->addDay()->toDateString(),
        ])->assertCreated()->json('id');

        $poster = Poster::query()->findOrFail($id);
        $content = PosterContent::resolve($poster->toArray());
        $this->assertStringContainsString('/p/' . $poster->code(), (string) $content['qr_url']);

        $wifi = PosterContent::resolve([
            'id' => $poster->id,
            'template_key' => 'wifi',
            'slots' => ['ssid' => 'Cafe', 'password' => 'secret'],
            'bindings' => [],
        ]);
        $this->assertStringStartsWith('WIFI:T:WPA;', (string) $wifi['qr_url']);

        $this->get('/p/' . $poster->code())->assertRedirect('/complain');
        $this->get('/p/' . $poster->code())->assertRedirect('/complain');
        $this->get('/p/NOPE')->assertRedirect('/menu');

        $this->assertSame(2, PosterScan::query()->count());
        $this->assertSame(
            ['id', 'poster_id', 'created_at'],
            Schema::getColumnListing('poster_scans'),
        );
        $this->assertSame(2, $this->getJson('/api/posters')->json('posters.0.scans'));
    }

    public function test_send_to_tv_adds_one_image_slide_until_the_take_down_date(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $end = now()->addDays(3)->toDateString();
        $id = $this->postJson('/api/posters', [
            'name' => 'Happy hour',
            'template_key' => 'happy_hour',
            'layout' => 'price_card',
            'sizes' => ['A3'],
            'slots' => ['headline' => 'Happy hour', 'price' => '20% off'],
            'take_down_on' => $end,
        ])->assertCreated()->json('id');

        $sent = $this->postJson("/api/posters/{$id}/tv")->assertOk();
        $this->assertSame($end, $sent->json('date_end'));
        $this->assertStringContainsString('-tv.png', (string) $sent->json('image_url'));

        $playlist = SignagePlaylist::query()->findOrFail($sent->json('playlist_id'));
        $slide = collect($playlist->slides)->firstWhere('id', $sent->json('slide_id'));
        $this->assertIsArray($slide);
        $this->assertSame($end, $slide['schedule']['date_end']);
        $image = collect($slide['elements'])->firstWhere('type', 'image');
        $this->assertIsArray($image);
        $this->assertNotSame('', (string) ($image['binding']['url'] ?? ''));

        $path = Storage::disk('public')->path('posters/screens/' . Poster::codeFor((int) $id) . '-tv.png');
        $this->assertFileExists($path);
        $info = getimagesize($path);
        $this->assertSame(1920, $info[0] ?? 0);
        $this->assertSame(1080, $info[1] ?? 0);

        $resolver = app(SignageResolver::class);
        $today = $resolver->resolveFresh('default', Carbon::now(), null, 'tv');
        $this->assertTrue(collect($today['slides'])->contains(fn ($row) => ($row['id'] ?? '') === $slide['id']));

        $later = $resolver->resolveFresh('default', Carbon::parse($end)->addDay(), null, 'tv-later');
        $this->assertFalse(collect($later['slides'])->contains(fn ($row) => ($row['id'] ?? '') === $slide['id']));
    }

    public function test_social_draft_uses_approval_best_time_and_channel_rules(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        SocialChannel::query()->create([
            'platform' => 'instagram', 'name' => 'IG',
            'credentials' => ['ig_user_id' => '9', 'access_token' => 't'],
            'is_enabled' => true, 'is_test_channel' => true,
        ]);
        SocialChannel::query()->create([
            'platform' => 'facebook', 'name' => 'Off',
            'credentials' => ['page_id' => '1', 'access_token' => 't'],
            'is_enabled' => false,
        ]);
        SiteSetting::set(SocialPostingRules::GAP_KEY, '240');
        SocialPost::query()->create([
            'status' => SocialPost::STATUS_SCHEDULED,
            'snapshot' => ['caption' => 'Already going out'],
            'source' => 'manual',
            'business_date' => now()->toDateString(),
            'scheduled_at' => now(),
        ]);

        $id = $this->postJson('/api/posters', [
            'name' => 'Happy hour',
            'template_key' => 'happy_hour',
            'layout' => 'price_card',
            'sizes' => ['A4'],
            'slots' => ['headline' => 'Happy hour', 'price' => '20% off'],
        ])->assertCreated()->json('id');

        $res = $this->postJson("/api/posters/{$id}/social")->assertOk();
        $this->assertSame(SocialPost::STATUS_AWAITING_APPROVAL, $res->json('status'));
        $this->assertNotNull($res->json('best_time'));
        $this->assertStringContainsString('wa.me', (string) $res->json('whatsapp'));
        $this->assertStringStartsWith('viber://forward?text=', (string) $res->json('viber'));
        $this->assertArrayHasKey('1080', $res->json('sizes'));
        $this->assertArrayHasKey('1200x630', $res->json('sizes'));

        $post = SocialPost::query()->findOrFail($res->json('post_id'));
        $this->assertSame('poster', $post->source);
        $this->assertNotSame(SocialPost::STATUS_QUEUED, $post->status);
        $this->assertSame(1, SocialPostDelivery::query()->where('social_post_id', $post->id)->count());

        $again = $this->postJson("/api/posters/{$id}/social")->assertOk();
        $this->assertSame($post->id, $again->json('post_id'));
        $this->assertSame(1, SocialPost::query()->where('source', 'poster')->count());
    }

    public function test_home_banner_keeps_other_slides_and_ends_with_the_offer(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        SiteSetting::set('hero_slides', json_encode([
            ['title' => 'Keep me', 'image' => '/old.jpg'],
        ]), 'website');
        $end = now()->addDays(2)->toDateString();
        $id = $this->postJson('/api/posters', [
            'name' => 'Weekend',
            'template_key' => 'weekend',
            'layout' => 'price_card',
            'sizes' => ['A3'],
            'take_down_on' => $end,
        ])->assertCreated()->json('id');

        $this->postJson("/api/posters/{$id}/banner", ['on' => true])->assertOk()->assertJsonPath('on', true);
        $slides = json_decode((string) SiteSetting::getScoped('hero_slides', 'website'), true);
        $this->assertCount(2, $slides);
        $this->assertSame('Keep me', $slides[0]['title']);
        $this->assertSame(Poster::codeFor((int) $id), $slides[1]['poster_code']);
        $this->assertSame($end, $slides[1]['show_until']);
        $this->assertTrue($this->getJson('/api/posters')->json('posters.0.banner'));

        $this->postJson("/api/posters/{$id}/banner", ['on' => false])->assertOk()->assertJsonPath('on', false);
        $left = json_decode((string) SiteSetting::getScoped('hero_slides', 'website'), true);
        $this->assertCount(1, $left);
        $this->assertSame('Keep me', $left[0]['title']);
    }

    public function test_a_menu_board_lays_out_on_a2(): void
    {
        $purpose = PosterPurposes::get('menu_board');
        $this->assertSame('list', $purpose['layout']);
        $this->assertTrue($purpose['landscape']);
        $paper = PaperSize::named('A2', true);
        $this->assertSame(594.0, $paper->trimWidth);
        $poster = [
            'template_key' => 'menu_board',
            'layout' => 'list',
            'mood' => 'dark',
            'language' => 'en',
        ];
        $content = PosterContent::resolve($poster + [
            'slots' => ['headline' => 'Menu'],
            'bindings' => [],
        ]);
        $built = PosterPieces::build($poster, $paper, $content);
        $this->assertNotEmpty($built['pieces']);
    }
}
