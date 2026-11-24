<?php

declare(strict_types=1);

namespace Tests\Feature\Ai;

use App\Domains\Ai\Assistant;
use App\Domains\Ai\ImageMaker;
use App\Domains\Ai\PhotoWork;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AiSuggestion;
use App\Models\Item;
use App\Models\Media;
use App\Models\Review;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-11-24: "I need generate food photo too. And build all the features."
 * The assistant looks at photos and a picture service makes them; every result waits
 * for a person, and a photo is looked at once.
 */
class AiPhotoSuggestionsTest extends TestCase
{
    use RefreshDatabase;

    public static int $asks = 0;

    public static int $made = 0;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        Storage::fake('public');
        Storage::fake('local');
        self::$asks = 0;
        self::$made = 0;
    }

    private function assistant(array $answer): void
    {
        $this->app->instance(Assistant::class, new class($answer) extends Assistant
        {
            public function __construct(private array $answer) {}

            public function ready(): bool
            {
                return true;
            }

            public function ask(string $instructions, string $prompt, array $schema, ?array $file = null, int $timeout = 60, int $maxTokens = 4000): array
            {
                AiPhotoSuggestionsTest::$asks++;
                \PHPUnit\Framework\Assert::assertNotNull($file, 'a photo job sends the picture');

                return $this->answer;
            }
        });
    }

    private function picture(int $w, int $h, string $type = 'jpeg'): string
    {
        $img = imagecreatetruecolor($w, $h);
        imagefilledrectangle($img, 0, 0, $w, $h, (int) imagecolorallocate($img, 200, 180, 150));
        ob_start();
        $type === 'png' ? imagepng($img) : imagejpeg($img, null, 80);

        return (string) ob_get_clean();
    }

    private function dishWithPhoto(): Item
    {
        Storage::disk('public')->put('menu/momo.jpg', $this->picture(1200, 900));
        Storage::disk('public')->put('menu-masters/momo.jpg', $this->picture(2000, 1000));

        return Item::factory()->create(['name' => 'Chicken Momo', 'is_active' => true, 'image_url' => '/storage/menu/momo.jpg', 'image_original_url' => '/storage/menu-masters/momo.jpg']);
    }

    public function test_the_crop_keeps_the_dish_whole_and_stays_inside_the_picture(): void
    {
        // A dish at the right edge of a wide photo: the cut moves right, a 4:3 no larger than the picture.
        $crop = PhotoWork::cropFor(2000, 1000, ['x' => 0.7, 'y' => 0.2, 'w' => 0.28, 'h' => 0.6]);
        $this->assertEqualsWithDelta(4 / 3, $crop['w'] / $crop['h'], 0.01);
        $this->assertLessThanOrEqual(2000, $crop['x'] + $crop['w']);
        $this->assertLessThanOrEqual(1400, $crop['x'], 'the dish starts at 1400 and is inside the cut');
        $this->assertGreaterThan(0.2, PhotoWork::apart($crop, PhotoWork::middleCrop(2000, 1000)));
        // A dish in the middle filling the frame: the same cut the menu already makes.
        $this->assertLessThan(0.05, PhotoWork::apart(PhotoWork::cropFor(2000, 1000, ['x' => 0.2, 'y' => 0.05, 'w' => 0.6, 'h' => 0.9]), PhotoWork::middleCrop(2000, 1000)));
    }

    public function test_one_look_at_a_dish_photo_proposes_a_crop_and_points_out_what_it_saw_once(): void
    {
        $momo = $this->dishWithPhoto();
        $this->assistant(['x' => 0.7, 'y' => 0.2, 'w' => 0.28, 'h' => 0.6, 'plain_background' => true, 'issues' => ['dark', 'nonsense'], 'note' => 'Hard to see the filling.']);

        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'photo_check'])->assertOk()->assertJsonPath('made', 3);
        $this->assertSame(1, self::$asks, 'one look gives the crop, the check and the cut-out note');
        $crop = AiSuggestion::query()->where('kind', 'photo_crop')->firstOrFail();
        $check = AiSuggestion::query()->where('kind', 'photo_check')->firstOrFail();
        $this->assertSame(1, AiSuggestion::query()->where('kind', 'photo_cutout')->count());
        $this->assertSame(['dark'], $check->proposed['issues'], 'only issues it knows');
        $this->assertStringContainsString('Too dark. Hard to see the filling.', (string) $check->reason);
        $preview = substr((string) $crop->proposed['preview'], strlen('/storage/'));
        Storage::disk('public')->assertExists($preview);
        $this->assertSame('/storage/menu/momo.jpg', $momo->fresh()->image_url, 'nothing on the menu has changed');

        // The same photo is not looked at again.
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'photo_crop'])->assertOk()->assertJsonPath('made', 0);
        $this->assertSame(1, self::$asks);

        // Approved: the dish shows the new cut, keeps its own master, and the preview is gone. The check is only dismissed.
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$crop->id, $check->id]])->assertOk()->assertJson(['approved' => 1, 'rejected' => 1]);
        $fresh = $momo->fresh();
        $this->assertNotSame('/storage/menu/momo.jpg', $fresh->image_url);
        $this->assertSame('/storage/menu-masters/momo.jpg', $fresh->image_original_url);
        $this->assertNotNull($fresh->thumb_url);
        Storage::disk('public')->assertMissing($preview);
        $this->assertSame(sha1((string) $fresh->image_url), $fresh->ai_photo_seen, 'its own new cut is not looked at again');
    }

    public function test_a_photo_replaced_since_makes_the_crop_stale(): void
    {
        $momo = $this->dishWithPhoto();
        $this->assistant(['x' => 0.7, 'y' => 0.2, 'w' => 0.28, 'h' => 0.6, 'plain_background' => false, 'issues' => [], 'note' => '']);
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'photo_crop'])->assertOk()->assertJsonPath('made', 1);
        $crop = AiSuggestion::query()->firstOrFail();
        $momo->update(['image_url' => '/storage/menu/new.jpg']);
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$crop->id]])->assertOk()->assertJson(['stale' => 1]);
        $this->assertSame('/storage/menu/new.jpg', $momo->fresh()->image_url);
    }

    public function test_a_made_photo_waits_and_goes_only_on_a_dish_that_still_has_none(): void
    {
        $this->assistant([]);
        $png = $this->picture(1024, 768, 'png');
        $this->app->instance(ImageMaker::class, new class($png) extends ImageMaker
        {
            public function __construct(private string $png) {}

            public function ready(): bool
            {
                return true;
            }

            public function make(string $prompt, int $timeout = 120): string
            {
                AiPhotoSuggestionsTest::$made++;
                \PHPUnit\Framework\Assert::assertStringContainsString('no text', $prompt);

                return $this->png;
            }
        });
        $bare = Item::factory()->create(['name' => 'Jhol Momo', 'short_description' => 'Momo in spicy soup', 'is_active' => true, 'image_url' => null]);
        $other = Item::factory()->create(['name' => 'Bajiya', 'is_active' => true, 'image_url' => null]);
        $this->dishWithPhoto();

        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'photo_generate'])->assertOk()->assertJsonPath('made', 2);
        $this->assertSame(2, self::$made, 'only for dishes with no photo');
        $this->assertNull($bare->fresh()->image_url);

        $mine = AiSuggestion::query()->where('subject_id', $bare->id)->firstOrFail();
        $theirs = AiSuggestion::query()->where('subject_id', $other->id)->firstOrFail();
        // Someone uploads a real photo of the other dish meanwhile: the made one is not put over it.
        $other->update(['image_url' => '/storage/menu/real.jpg']);
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$mine->id, $theirs->id]])->assertOk()->assertJson(['approved' => 1, 'stale' => 1]);

        $fresh = $bare->fresh();
        $this->assertStringStartsWith('/storage/menu/', (string) $fresh->image_url);
        $this->assertTrue((bool) $fresh->image_ai_generated, 'marked as made, not taken');
        $this->assertNotNull($fresh->image_original_url);
        $this->assertSame('/storage/menu/real.jpg', $other->fresh()->image_url);
        $this->assertFalse((bool) $other->fresh()->image_ai_generated);
    }

    public function test_a_library_picture_gets_its_description_on_approval_with_the_persons_wording(): void
    {
        Storage::disk('public')->put('library/images/a.jpg', $this->picture(800, 600));
        $m = Media::query()->create(['disk' => 'public', 'path' => 'library/images/a.jpg', 'media_type' => 'image', 'mime_type' => 'image/jpeg', 'title' => 'IMG_2231']);
        $this->assistant(['alt' => 'Steamed momo on a white plate with a red dip.', 'tags' => ['Momo', 'steamed', 'white plate', 'momo']]);

        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'media_describe'])->assertOk()->assertJsonPath('made', 1);
        $this->assertNull($m->fresh()->alt_text);
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'media_describe'])->assertOk()->assertJsonPath('made', 0);
        $this->assertSame(1, self::$asks, 'a picture is described once');

        $s = AiSuggestion::query()->firstOrFail();
        $this->assertSame(['momo', 'steamed', 'white plate'], $s->proposed['tags']);
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$s->id], 'edits' => [$s->id => ['alt_text' => 'Steamed chicken momo with chilli dip.']]])->assertOk()->assertJson(['approved' => 1]);
        $this->assertSame('Steamed chicken momo with chilli dip.', $m->fresh()->alt_text);
        $this->assertSame(['momo', 'steamed', 'white plate'], $m->fresh()->tags);
    }

    public function test_a_waiting_reviews_photo_gets_a_note_for_staff_only(): void
    {
        Storage::disk('local')->put('review-photos/r.jpg', $this->picture(800, 600));
        $item = Item::factory()->create(['name' => 'Chicken Momo', 'is_active' => true]);
        $review = Review::query()->create(['item_id' => $item->id, 'rating' => 4, 'comment' => 'Nice', 'type' => 'item', 'status' => 'pending', 'photos' => [['path' => 'review-photos/r.jpg', 'thumb' => 'review-photos/r.jpg']]]);
        $this->assistant(['shows' => 'A person at a table, face close up.', 'concern' => true]);
        // Only the review notes in this run.
        foreach (['auto_menu', 'auto_inventory', 'auto_labels', 'auto_photos', 'photo_generate'] as $off) {
            \App\Models\SiteSetting::set("ai_feature_{$off}", '0');
        }

        $this->artisan('ai:suggest')->assertSuccessful();
        $this->assertSame('Check before showing: A person at a table, face close up.', $review->fresh()->photo_note);
        $this->assertSame('pending', $review->fresh()->status, 'the note decides nothing');

        $this->getJson('/api/admin/reviews')->assertOk()->assertJsonPath('data.0.photo_note', 'Check before showing: A person at a table, face close up.');
        $review->update(['status' => 'approved']);
        $public = $this->getJson("/api/items/{$item->id}/reviews");
        $this->assertStringNotContainsString('Check before showing', (string) $public->getContent(), 'a customer never sees the note');

        // Looked at once.
        $asks = self::$asks;
        $this->artisan('ai:suggest')->assertSuccessful();
        $this->assertSame($asks, self::$asks);
    }
}
