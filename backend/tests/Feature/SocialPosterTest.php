<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\SocialPoster;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Social Hub → Make a post (owner, 2026-11-14): a post is saved with its
 * words and its design, opened again as it was, and its finished picture is
 * kept as a JPEG a channel can fetch.
 */
class SocialPosterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        Storage::fake('public');
    }

    /** @return array<string, mixed> */
    private function body(array $over = []): array
    {
        return $over + [
            'name' => 'Frozen Momo',
            'layout' => 'splash',
            'palette' => 'bee',
            'spec' => [
                'headline' => 'Frozen Momo', 'kicker' => 'New', 'tagline' => 'Steamed, frozen, handmade', 'price' => '45.00', 'was' => '',
                'badge' => 'Microwave & Eat', 'cta' => 'Order now', 'phone' => '9120011', 'website' => 'bakeandgrill.mv',
                'link' => 'https://example.test/order', 'photo' => '/brand/photos/momo/momo-plate.png', 'cutout' => true, 'itemId' => null,
                'show' => ['price' => true, 'badge' => true, 'cta' => true, 'phone' => true, 'logo' => true, 'qr' => false],
                'something_else' => 'left out',
            ],
        ];
    }

    public function test_a_post_is_saved_changed_listed_and_removed(): void
    {
        $id = $this->postJson('/api/admin/social/posters', $this->body())->assertCreated()
            ->assertJsonPath('data.spec.headline', 'Frozen Momo')
            ->assertJsonPath('data.spec.cutout', true)
            ->assertJsonPath('data.spec.show.price', true)
            ->assertJsonPath('data.spec.show.qr', false)
            ->assertJsonPath('data.spec.show.website', false)
            ->assertJsonMissingPath('data.spec.something_else')
            ->json('data.id');

        // One click changes the design; the words stay.
        $this->putJson("/api/admin/social/posters/{$id}", $this->body(['layout' => 'arch', 'palette' => 'rust']))->assertOk()
            ->assertJsonPath('data.layout', 'arch')
            ->assertJsonPath('data.spec.headline', 'Frozen Momo');

        $list = $this->getJson('/api/admin/social/posters')->assertOk();
        $list->assertJsonPath('data.0.id', $id)->assertJsonPath('data.0.palette', 'rust');
        $this->assertNotSame('', (string) $list->json('brand.name'));
        $this->assertStringEndsWith('/order', (string) $list->json('brand.order_url'));

        $this->postJson('/api/admin/social/posters', $this->body(['layout' => 'Not A Key!']))->assertStatus(422);
        $this->deleteJson("/api/admin/social/posters/{$id}")->assertOk();
        $this->assertSame(0, SocialPoster::query()->count());
    }

    public function test_a_finished_picture_is_kept_as_a_jpeg(): void
    {
        $res = $this->post('/api/admin/social/posters/picture', ['picture' => UploadedFile::fake()->image('post.png', 1080, 1350)], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame(1080, $res->json('width'));
        $this->assertStringEndsWith('.jpg', (string) $res->json('url'));
        $files = Storage::disk('public')->allFiles('social-posters');
        $this->assertCount(1, $files);
        $this->assertSame("\xFF\xD8", substr((string) Storage::disk('public')->get($files[0]), 0, 2));

        $this->post('/api/admin/social/posters/picture', ['picture' => UploadedFile::fake()->image('tiny.png', 50, 50)], ['Accept' => 'application/json'])->assertStatus(422);
        $this->post('/api/admin/social/posters/picture', ['picture' => UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_someone_who_may_only_look_cannot_save(): void
    {
        $viewer = \App\Models\User::factory()->create();
        $role = \App\Models\Role::query()->where('slug', 'cashier')->first();
        if ($role) {
            $viewer->role_id = $role->id;
            $viewer->save();
        }
        Sanctum::actingAs($viewer, ['staff']);
        $this->postJson('/api/admin/social/posters', $this->body())->assertStatus(403);
    }
}
