<?php

declare(strict_types=1);

namespace Tests\Unit\Posters;

use App\Domains\Posters\PosterPhoto;
use Tests\TestCase;

/**
 * Photos stay RGB inside a PDF/X-4 file, which is allowed only when each
 * one carries its own ICC profile (docs/POSTER_PLAN.md § 6.1, § 7).
 */
class PosterPhotoTest extends TestCase
{
    private string $file;

    protected function setUp(): void
    {
        parent::setUp();
        $this->file = tempnam(sys_get_temp_dir(), 'bg-photo') . '.jpg';
        file_put_contents($this->file, PosterPhoto::synthetic(800, 600));
    }

    protected function tearDown(): void
    {
        @unlink($this->file);
        parent::tearDown();
    }

    public function test_srgb_profile_is_inserted_once_as_an_app2_segment(): void
    {
        $plain = PosterPhoto::synthetic(64, 64);
        $this->assertStringNotContainsString("ICC_PROFILE\0", $plain);

        $tagged = PosterPhoto::withSrgbProfile($plain);

        $this->assertStringStartsWith("\xFF\xD8", $tagged);
        $this->assertSame(1, substr_count($tagged, "ICC_PROFILE\0"));
        $this->assertSame($tagged, PosterPhoto::withSrgbProfile($tagged), 'idempotent');
        $this->assertSame(strlen($plain) + strlen((string) PosterPhoto::srgbProfile()) + 18, strlen($tagged));
        $this->assertNotFalse(@imagecreatefromstring($tagged), 'GD still reads it');
    }

    public function test_cover_crops_to_the_page_shape_at_the_asked_ppi(): void
    {
        // A tall page from a wide photo: height limits, width is cropped.
        $out = PosterPhoto::cover($this->file, 25.4, 50.8, 10);

        $this->assertSame(10, $out['w']);
        $this->assertSame(20, $out['h']);
        $this->assertSame(800, $out['source_w']);
        $this->assertSame(600, $out['source_h']);
        $this->assertStringContainsString("ICC_PROFILE\0", $out['jpeg']);
        $this->assertSame([10, 20], array_slice((array) getimagesizefromstring($out['jpeg']), 0, 2));
    }

    public function test_cover_never_upscales(): void
    {
        // 25.4 mm at 2000 ppi wants 2000 px from a 600 px tall photo.
        $out = PosterPhoto::cover($this->file, 25.4, 25.4, 2000);

        $this->assertSame(600, $out['w']);
        $this->assertSame(600, $out['h']);
    }
}
