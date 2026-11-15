<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Menu audit, 2026-11-15: every answer says how long the server took and on
 * what, so a slow page can be measured from outside.
 */
class ServerTimingTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_page_and_an_api_answer_carry_their_timings(): void
    {
        foreach (['/menu', '/api/categories'] as $path) {
            $header = (string) $this->get($path)->assertOk()->headers->get('Server-Timing');

            $this->assertMatchesRegularExpression(
                '/^boot;dur=[\d.]+, db;dur=[\d.]+;desc="\d+ queries", app;dur=[\d.]+$/',
                $header,
                $path,
            );
        }
    }

    public function test_the_public_menu_comes_in_one_page(): void
    {
        $this->getJson('/api/items?view=customer&channel=online_pickup')
            ->assertOk()
            ->assertJsonPath('per_page', 500);
    }
}
