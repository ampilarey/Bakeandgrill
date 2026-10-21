<?php

declare(strict_types=1);

namespace Tests\Unit\Posters;

use App\Domains\Posters\PaperSize;
use App\Domains\Posters\PosterPieces;
use App\Domains\Posters\PosterPreflight;
use App\Domains\Posters\PosterPurposes;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PosterPiecesTest extends TestCase
{
    public function test_every_purpose_but_the_complaint_poster_is_drawn_on_this_engine(): void
    {
        $this->assertCount(8, PosterPurposes::layouts());
        $this->assertGreaterThan(20, count(PosterPurposes::all()));
        $this->assertSame('/complain/poster/sheet', PosterPurposes::get('how_we_did')['external']);
        foreach (['bogo', 'wifi', 'wash_hands', 'eid', 'we_cater', 'chefs_pick'] as $key) {
            $this->assertNotNull(PosterPurposes::get($key), $key);
        }
        foreach (PosterPurposes::all() as $key => $purpose) {
            // The complaint poster alone is drawn on its own page, so one engine draws it.
            $this->assertSame($key === 'how_we_did' ? '/complain/poster/sheet' : null, $purpose['external'], $key);
            // A template poster is drawn by its design (PosterThemes), not by one of the eight layouts.
            $this->assertContains($purpose['layout'], $key === PosterPurposes::THEMED ? [PosterPurposes::THEMED] : PosterPurposes::layouts(), $key);
        }
    }

    #[DataProvider('layouts')]
    public function test_every_layout_places_type_inside_the_safe_zone(string $layout): void
    {
        $poster = [
            'template_key' => 'plain_notice',
            'layout' => $layout,
            'mood' => 'dark',
            'language' => 'both',
        ];
        $content = [
            'eyebrow' => 'New',
            'headline' => 'Chicken tikka',
            'headline_dv' => 'ޗިކަން ޓިކާ',
            'subhead' => 'Until 9 pm',
            'subhead_dv' => '',
            'body' => 'Ask at the counter.',
            'body_dv' => 'ކައުންޓަރުން އަހާ',
            'badge' => 'Today',
            'price' => 'From MVR 85.00',
            'old_price' => 'MVR 95.00',
            'gst' => 'Prices include GST',
            'gst_dv' => 'އަގުތަކުގައި ޖީއެސްޓީ ހިމެނޭ',
            'qr_url' => 'https://bakeandgrill.mv/menu',
            'photo' => null,
            'rows' => [
                ['name' => 'Chicken tikka', 'name_dv' => '', 'price' => 'MVR 85.00'],
                ['name' => 'Fish bun', 'name_dv' => '', 'price' => 'MVR 25.00'],
            ],
            'hours' => [
                ['day' => 'Sunday', 'time' => '4 pm – 11 pm'],
                ['day' => 'Monday', 'time' => 'Closed'],
            ],
            'problems' => [],
            'warnings' => [],
            'price_live' => 'From MVR 85.00',
        ];
        $size = PaperSize::named('A4');
        $built = PosterPieces::build($poster, $size, $content);
        $checks = PosterPreflight::check($poster, $content, $built, $size, ['material' => 'foam', 'white' => 'none']);

        $this->assertNotEmpty($built['pieces']);
        $safe = array_values(array_filter($checks, static fn (array $c): bool => $c['id'] === 'safe'));
        $this->assertSame('ok', $safe[0]['level'], $layout . ' ' . $safe[0]['message']);
        $qr = array_values(array_filter($checks, static fn (array $c): bool => $c['id'] === 'qr'));
        $this->assertNotSame('red', $qr[0]['level'], $layout);
    }

    /** @return list<array{0: string}> */
    public static function layouts(): array
    {
        return array_map(static fn (string $layout): array => [$layout], PosterPurposes::layouts());
    }

    public function test_a_wrong_price_is_red_and_clear_material_without_white_is_red(): void
    {
        $poster = ['layout' => 'price_card', 'mood' => 'cream', 'language' => 'en', 'template_key' => 'happy_hour'];
        $content = [
            'headline' => 'Happy hour', 'headline_dv' => '', 'price' => 'MVR 1.00', 'gst' => 'Prices include GST',
            'gst_dv' => '', 'qr_url' => 'https://bakeandgrill.mv/menu', 'price_live' => 'MVR 85.00',
            'problems' => ['The offer has ended.'], 'warnings' => [],
        ];
        $built = PosterPieces::build($poster, PaperSize::named('A5'), $content);
        $checks = PosterPreflight::check($poster, $content, $built, PaperSize::named('A5'), ['material' => 'clear', 'white' => 'none']);

        $this->assertTrue(PosterPreflight::blocked($checks));
        $ids = array_column(array_filter($checks, static fn (array $c): bool => $c['level'] === 'red'), 'id');
        $this->assertContains('price', $ids);
        $this->assertContains('white', $ids);
        $this->assertContains('data', $ids);
    }
}
