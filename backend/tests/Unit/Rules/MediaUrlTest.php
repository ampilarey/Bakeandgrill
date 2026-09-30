<?php

declare(strict_types=1);

namespace Tests\Unit\Rules;

use App\Rules\MediaUrl;
use PHPUnit\Framework\TestCase;

class MediaUrlTest extends TestCase
{
    private function fails(string $value): bool
    {
        $failed = false;
        (new MediaUrl)->validate('logo', $value, function () use (&$failed): void {
            $failed = true;
        });

        return $failed;
    }

    public function test_uploaded_paths_and_absolute_urls_pass(): void
    {
        $this->assertFalse($this->fails('/storage/menu/a.jpg'));
        $this->assertFalse($this->fails('https://example.com/a.png'));
    }

    /** Owner, 2026-09-30: the light logo ships with the site under /brand. */
    public function test_shipped_brand_files_pass_and_other_site_paths_do_not(): void
    {
        $this->assertFalse($this->fails('/brand/logo-light.png'));
        $this->assertFalse($this->fails('/images/cafe/hedhika.jpg'));
        $this->assertTrue($this->fails('/brand/../index.php'));
        $this->assertTrue($this->fails('/admin/index.html'));
        $this->assertTrue($this->fails('/brand/pack.zip'));
    }
}
