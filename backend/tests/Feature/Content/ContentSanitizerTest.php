<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Support\ContentSanitizer;
use Tests\TestCase;

class ContentSanitizerTest extends TestCase
{
    public function test_strips_script_and_onclick_keeps_allowed_tags(): void
    {
        $dirty = '<p>Hello <strong>world</strong><script>alert(1)</script></p>'
            . '<a href="https://bakeandgrill.mv" onclick="evil()">Link</a>'
            . '<a href="javascript:alert(1)">Bad</a>';

        $clean = ContentSanitizer::clean($dirty);

        $this->assertStringNotContainsString('<script', $clean);
        $this->assertStringNotContainsString('onclick', $clean);
        $this->assertStringNotContainsString('javascript:', $clean);
        $this->assertStringContainsString('<strong>world</strong>', $clean);
        $this->assertStringContainsString('href="https://bakeandgrill.mv"', $clean);
    }
}
