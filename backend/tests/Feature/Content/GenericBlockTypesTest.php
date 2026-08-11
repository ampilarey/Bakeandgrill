<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Domains\Content\Blocks\PageBlockRepository;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Media;
use App\Models\PageBlock;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage E: the seven free-form content blocks (text, image, image+text,
 * button band, divider, video, FAQ list).
 */
class GenericBlockTypesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        PermissionCatalogSync::sync();
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'generic-blocks@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('9999'),
            'is_active' => true,
        ]);
        $this->owner->grantPermission('website.manage');
        Sanctum::actingAs($this->owner, ['staff']);
        HomeLayoutMigrator::migrate();
    }

    // ── Rendering ────────────────────────────────────────────────────────────

    public function test_every_generic_type_renders_on_the_website_home(): void
    {
        $image = $this->makeMedia('image');
        $video = $this->makeMedia('video');

        $this->addBlock('website', 'rich_text', ['heading' => 'Our story', 'body' => '<p>Baked daily.</p>']);
        $this->addBlock('website', 'image', ['media_id' => $image->id, 'caption' => 'Fresh out of the oven']);
        $this->addBlock('website', 'image_text', [
            'media_id' => $image->id,
            'heading' => 'Since 2014',
            'body' => '<p>Family run.</p>',
            'side' => 'right',
        ]);
        $this->addBlock('website', 'button_band', [
            'text' => 'Hungry already?',
            'button1_label' => 'Order now',
            'button1_url' => '/order/',
        ]);
        $this->addBlock('website', 'divider', ['style' => 'rule', 'size' => 'lg']);
        $this->addBlock('website', 'video', ['media_id' => $video->id, 'caption' => 'Behind the counter']);
        $this->addBlock('website', 'faq_list', [
            'items' => [['question' => 'Do you deliver to Hulhumale?', 'answer' => '<p>Yes, daily.</p>']],
        ]);

        $html = $this->get('/')->assertOk()->getContent();

        foreach (['rich_text', 'image', 'image_text', 'button_band', 'divider', 'video', 'faq_list'] as $type) {
            $this->assertStringContainsString('data-home-block="'.$type.'"', $html, "Missing marker for {$type}.");
        }
        $this->assertStringContainsString('Our story', $html);
        $this->assertStringContainsString('Fresh out of the oven', $html);
        $this->assertStringContainsString('data-side="right"', $html);
        $this->assertStringContainsString('Hungry already?', $html);
        $this->assertStringContainsString('Do you deliver to Hulhumale?', $html);
    }

    public function test_order_app_api_returns_generic_blocks_with_resolved_media(): void
    {
        $image = $this->makeMedia('image');
        $this->addBlock('order_app', 'rich_text', ['heading' => 'Welcome', 'body' => '<p>Hi.</p>']);
        $this->addBlock('order_app', 'image', ['media_id' => $image->id]);
        $this->addBlock('order_app', 'divider', ['style' => 'spacer', 'size' => 'sm']);

        $blocks = collect($this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks'));

        foreach (['rich_text', 'image', 'divider'] as $type) {
            $this->assertContains($type, $blocks->pluck('block_type')->all());
        }
        $imageBlock = $blocks->firstWhere('block_type', 'image');
        $this->assertSame('/storage/media/photo.jpg', $imageBlock['media']['image']['url']);
        $this->assertSame('/storage/media/photo.webp', $imageBlock['media']['image']['webp']);
    }

    public function test_video_block_media_resolves_for_the_order_app(): void
    {
        $video = $this->makeMedia('video');
        $this->addBlock('order_app', 'video', ['media_id' => $video->id]);

        $block = collect($this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks'))
            ->firstWhere('block_type', 'video');

        $this->assertSame('/storage/media/clip.mp4', $block['media']['video']['url']);
        $this->assertSame('/storage/media/clip-thumb.jpg', $block['media']['video']['poster_url']);
    }

    // ── App permissions ──────────────────────────────────────────────────────

    public function test_faq_list_cannot_be_added_to_the_order_app(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'order_app',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'faq_list',
            'settings' => ['items' => [['question' => 'Q', 'answer' => 'A']]],
        ])->assertStatus(422)->assertJsonValidationErrors('block_type');

        $this->assertSame(0, PageBlock::query()->where('block_type', 'faq_list')->count());
    }

    public function test_a_rogue_faq_row_is_not_served_to_the_order_app(): void
    {
        PageBlock::create([
            'app' => 'order_app',
            'page' => 'home',
            'block_type' => 'faq_list',
            'position' => 99,
            'is_enabled' => true,
            'content_mode' => 'own',
            'settings' => ['items' => [['question' => 'Q', 'answer' => 'A']]],
        ]);
        PageBlockRepository::bustAll();

        $types = collect($this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks'))
            ->pluck('block_type')
            ->all();

        $this->assertNotContains('faq_list', $types);
    }

    // ── Settings schema ──────────────────────────────────────────────────────

    /**
     * @return array<string, array{0: string, 1: array<string, mixed>, 2: string}>
     */
    public static function invalidSettingsProvider(): array
    {
        return [
            'divider style' => ['divider', ['style' => 'zigzag', 'size' => 'md'], 'settings.style'],
            'divider size' => ['divider', ['style' => 'rule', 'size' => 'huge'], 'settings.size'],
            'image_text side' => ['image_text', ['side' => 'middle'], 'settings.side'],
            'image media missing' => ['image', ['media_id' => 999999], 'settings.media_id'],
            'rich text too long' => ['rich_text', ['heading' => str_repeat('a', 201)], 'settings.heading'],
            'faq answer required' => ['faq_list', ['items' => [['question' => 'Q']]], 'settings.items.0.answer'],
        ];
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('invalidSettingsProvider')]
    public function test_settings_failing_the_schema_are_rejected(string $type, array $settings, string $errorKey): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => $type,
            'settings' => $settings,
        ])->assertStatus(422)->assertJsonValidationErrors($errorKey);
    }

    public function test_required_settings_get_their_default_when_a_block_is_created_empty(): void
    {
        $dividerRes = $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'divider',
        ])->assertCreated();
        $divider = $dividerRes->json('block.settings');
        $this->assertSame('spacer', $divider['style']);
        $this->assertSame('md', $divider['size']);

        $imageText = $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => $dividerRes->json('version'),
            'block_type' => 'image_text',
        ])->assertCreated()->json('block.settings');
        $this->assertSame('left', $imageText['side']);
    }

    public function test_generic_types_may_be_added_more_than_once(): void
    {
        $this->addBlock('website', 'rich_text', ['heading' => 'First']);
        $this->addBlock('website', 'rich_text', ['heading' => 'Second']);

        $this->assertSame(2, PageBlock::query()->where('block_type', 'rich_text')->count());

        $available = collect($this->getJson('/api/admin/page-blocks?app=website')->assertOk()->json('available_types'))
            ->firstWhere('type', 'rich_text');
        $this->assertTrue($available['allows_multiple']);
        $this->assertArrayHasKey('body', $available['settings_schema']);
    }

    // ── Sanitisation ─────────────────────────────────────────────────────────

    public function test_script_tags_in_rich_text_never_reach_storage_or_the_page(): void
    {
        $payload = '<p>Hello</p><script>alert(1)</script><img src=x onerror="alert(2)">';

        $block = $this->addBlock('website', 'rich_text', [
            'heading' => 'Safe <script>alert(3)</script>',
            'body' => $payload,
        ]);

        $stored = $block->settings;
        $this->assertStringNotContainsString('<script', $stored['body']);
        $this->assertStringNotContainsString('onerror', $stored['body']);
        $this->assertStringNotContainsString('<script', $stored['heading']);
        $this->assertStringContainsString('Hello', $stored['body']);

        PageBlockRepository::bustAll();
        Cache::flush();
        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringNotContainsString('alert(1)', $html);
        $this->assertStringNotContainsString('onerror', $html);
        $this->assertStringContainsString('Hello', $html);
    }

    public function test_script_tags_are_stripped_for_the_order_app_too(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'order_app',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'rich_text',
            'content_mode' => 'own',
            'settings' => ['body' => 'Hi<script>alert(1)</script>'],
        ])->assertCreated();
        $this->postJson('/api/admin/page-blocks/publish', [
            'app' => 'order_app',
            'page' => 'home',
            'version' => 1,
        ])->assertOk();

        $block = collect($this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks'))
            ->firstWhere('block_type', 'rich_text');

        $this->assertStringNotContainsString('<script', (string) $block['settings']['body']);
    }

    public function test_faq_answers_and_button_links_are_sanitised(): void
    {
        $faqRes = $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'faq_list',
            'settings' => [
                'items' => [[
                    'question' => 'Are you open <script>alert(1)</script>late?',
                    'answer' => '<p>Yes</p><script>alert(2)</script>',
                ]],
            ],
        ])->assertCreated();
        $faq = $faqRes->json('block.settings');

        $this->assertStringNotContainsString('<script', $faq['items'][0]['question']);
        $this->assertStringNotContainsString('<script', $faq['items'][0]['answer']);

        $band = $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => $faqRes->json('version'),
            'block_type' => 'button_band',
            'settings' => [
                'text' => 'Tap <script>alert(1)</script>below',
                'button1_label' => 'Go',
                'button1_url' => 'javascript:alert(1)',
            ],
        ])->assertCreated()->json('block.settings');

        $this->assertStringNotContainsString('<script', $band['text']);
        $this->assertSame('', $band['button1_url'], 'A javascript: link must not survive.');
    }

    // ── Degrade paths ────────────────────────────────────────────────────────

    public function test_image_block_pointing_at_deleted_media_still_renders_the_page(): void
    {
        $image = $this->makeMedia('image');
        $this->addBlock('website', 'image', ['media_id' => $image->id, 'caption' => 'Gone soon']);
        $this->addBlock('website', 'video', ['media_id' => $this->makeMedia('video')->id]);

        Media::query()->delete();
        PageBlockRepository::bustAll();
        Cache::flush();

        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringNotContainsString('data-home-block="image"', $html);
        $this->assertStringNotContainsString('data-home-block="video"', $html);
        $this->assertStringNotContainsString('Gone soon', $html);
        // The rest of the page is untouched.
        $this->assertStringContainsString('trust-strip', $html);
    }

    public function test_blocks_with_empty_settings_render_nothing(): void
    {
        foreach (['rich_text', 'image', 'image_text', 'button_band', 'video', 'faq_list'] as $type) {
            PageBlock::create([
                'app' => 'website',
                'page' => 'home',
                'block_type' => $type,
                'position' => 500,
                'is_enabled' => true,
                'content_mode' => 'own',
                'settings' => [],
            ]);
        }
        PageBlockRepository::bustAll();
        Cache::flush();

        $html = $this->get('/')->assertOk()->getContent();

        foreach (['rich_text', 'image', 'image_text', 'button_band', 'video', 'faq_list'] as $type) {
            $this->assertStringNotContainsString(
                'data-home-block="'.$type.'"',
                $html,
                "An empty {$type} block must not leave a shell on the page.",
            );
        }
    }

    public function test_disabled_generic_block_does_not_render(): void
    {
        $block = $this->addBlock('website', 'rich_text', ['heading' => 'Hidden note']);
        PageBlock::query()->whereKey($block->id)->update(['is_enabled' => false]);
        PageBlockRepository::bustAll();
        Cache::flush();

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringNotContainsString('Hidden note', $html);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $settings */
    private function addBlock(string $app, string $type, array $settings = []): PageBlock
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => $app,
            'page' => 'home',
            'version' => 0,
            'block_type' => $type,
            'content_mode' => 'own',
            'settings' => $settings,
        ])->assertCreated();

        $this->postJson('/api/admin/page-blocks/publish', [
            'app' => $app,
            'page' => 'home',
            'version' => 1,
        ])->assertOk();

        PageBlockRepository::bustAll();
        Cache::flush();

        return PageBlock::query()
            ->where('app', $app)
            ->where('page', 'home')
            ->where('block_type', $type)
            ->orderByDesc('id')
            ->firstOrFail();
    }

    private function makeMedia(string $type): Media
    {
        if ($type === 'video') {
            return Media::create([
                'disk' => 'public',
                'path' => 'media/clip.mp4',
                'media_type' => 'video',
                'mime_type' => 'video/mp4',
                'thumb_url' => '/storage/media/clip-thumb.jpg',
                'alt_text' => 'Kitchen clip',
            ]);
        }

        return Media::create([
            'disk' => 'public',
            'path' => 'media/photo.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'thumb_url' => '/storage/media/photo-thumb.jpg',
            'image_webp_url' => '/storage/media/photo.webp',
            'thumb_webp_url' => '/storage/media/photo-thumb.webp',
            'alt_text' => 'A loaf of bread',
            'width' => 1200,
            'height' => 800,
        ]);
    }
}
