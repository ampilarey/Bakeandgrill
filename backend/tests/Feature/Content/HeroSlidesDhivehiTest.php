<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
use App\Domains\Content\HeroSlides;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The Dhivehi home shows the English slides, with Dhivehi words where they were written (2026-10-18). */
class HeroSlidesDhivehiTest extends TestCase
{
    use RefreshDatabase;

    private function slides(string $locale): array
    {
        return HeroSlides::resolve(static fn (string $k, mixed $d) => ContentResolver::for('website', $locale)->get($k, $d));
    }

    public function test_an_old_dhivehi_set_never_brings_back_slides_english_removed(): void
    {
        SiteSetting::set('hero_slides', json_encode([['title' => 'Now', 'image' => '/a.jpg']]), 'website', 'en');
        SiteSetting::set('hero_slides', json_encode([
            ['title' => 'Old one', 'image' => '/old1.jpg'],
            ['title' => 'Old two', 'image' => '/old2.jpg'],
            ['title' => 'Old three', 'image' => '/old3.jpg'],
        ]), 'website', 'dv');

        $dv = $this->slides('dv');
        $this->assertCount(1, $dv);
        $this->assertSame('Now', $dv[0]['title']);
        $this->assertSame('/a.jpg', $dv[0]['image']);
    }

    public function test_dhivehi_words_written_for_a_slide_still_show(): void
    {
        SiteSetting::set('hero_slides', json_encode([
            ['title' => 'Breakfast', 'subtitle' => 'Fresh', 'image' => '/a.jpg'],
            ['title' => 'Pastries', 'image' => '/b.jpg'],
        ]), 'website', 'en');
        SiteSetting::set('hero_slides', json_encode([
            ['title' => 'ހެނދުނުގެ ނާސްތާ', 'subtitle' => '', 'image' => '/a.jpg'],
        ]), 'website', 'dv');

        $dv = $this->slides('dv');
        $this->assertCount(2, $dv);
        $this->assertSame('ހެނދުނުގެ ނާސްތާ', $dv[0]['title']);
        $this->assertSame('Fresh', $dv[0]['subtitle']);
        $this->assertSame('Pastries', $dv[1]['title']);
    }
}
