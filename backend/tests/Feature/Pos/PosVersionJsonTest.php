<?php

declare(strict_types=1);

namespace Tests\Feature\Pos;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PosVersionJsonTest extends TestCase
{
    use RefreshDatabase;

    public function test_pos_version_json_returns_no_store_headers(): void
    {
        $payload = [
            'version' => '1.0.9',
            'build' => '2026-05-22-120000-abc1234',
            'commit' => 'abc1234',
            'built_at' => '2026-05-22T12:00:00.000Z',
        ];

        $dir = public_path('pos');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents($dir.'/pos-version.json', json_encode($payload, JSON_THROW_ON_ERROR));

        $response = $this->get('/pos-version.json');

        $response->assertOk();
        $cacheControl = (string) $response->headers->get('Cache-Control');
        $this->assertStringContainsString('no-store', $cacheControl);
        $this->assertStringContainsString('no-cache', $cacheControl);
        $response->assertHeader('Pragma', 'no-cache')
            ->assertHeader('Expires', '0')
            ->assertJsonPath('version', '1.0.9')
            ->assertJsonPath('build', '2026-05-22-120000-abc1234');
    }

    public function test_pos_version_json_route_requires_pos_folder_file(): void
    {
        $path = public_path('pos/pos-version.json');
        if (is_file($path)) {
            rename($path, $path.'.bak');
        }

        try {
            $this->get('/pos-version.json')->assertNotFound();
        } finally {
            if (is_file($path.'.bak')) {
                rename($path.'.bak', $path);
            }
        }
    }
}
