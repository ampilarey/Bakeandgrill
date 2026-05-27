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
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $path = $dir . '/pos-version.json';
        $hadOriginal = is_file($path);
        $backup = $hadOriginal ? (string) file_get_contents($path) : null;
        file_put_contents($path, json_encode($payload, JSON_THROW_ON_ERROR));

        try {
            $response = $this->get('/pos-version.json');

            $response->assertOk();
            $cacheControl = (string) $response->headers->get('Cache-Control');
            $this->assertStringContainsString('no-store', $cacheControl);
            $this->assertStringContainsString('no-cache', $cacheControl);
            $response->assertHeader('Pragma', 'no-cache')
                ->assertHeader('Expires', '0')
                ->assertJsonPath('version', '1.0.9')
                ->assertJsonPath('build', '2026-05-22-120000-abc1234');
        } finally {
            if ($hadOriginal && $backup !== null) {
                file_put_contents($path, $backup);
            } elseif (!$hadOriginal && is_file($path)) {
                unlink($path);
            }
        }
    }

    public function test_pos_version_json_route_requires_pos_folder_file(): void
    {
        $path = public_path('pos/pos-version.json');
        if (is_file($path)) {
            rename($path, $path . '.bak');
        }

        try {
            $this->get('/pos-version.json')->assertNotFound();
        } finally {
            if (is_file($path . '.bak')) {
                rename($path . '.bak', $path);
            }
        }
    }

    public function test_pos_version_json_matches_shipped_js_bundle(): void
    {
        $versionPath = public_path('pos/pos-version.json');
        $indexPath = public_path('pos/index.html');

        if (!is_file($versionPath) || !is_file($indexPath)) {
            $this->markTestSkipped('POS assets not deployed in this checkout.');
        }

        $version = json_decode((string) file_get_contents($versionPath), true, 512, JSON_THROW_ON_ERROR);
        $indexHtml = (string) file_get_contents($indexPath);

        $this->assertIsArray($version);
        $this->assertArrayHasKey('build', $version);
        $this->assertArrayHasKey('commit', $version);

        if (!preg_match('#src="/pos/assets/([^"]+\.js)"#', $indexHtml, $matches)) {
            $this->fail('POS index.html is missing a /pos/assets/*.js script tag.');
        }

        $bundlePath = public_path('pos/assets/' . $matches[1]);
        $this->assertFileExists($bundlePath, 'POS JS bundle referenced by index.html is missing.');

        $bundle = (string) file_get_contents($bundlePath);
        $this->assertStringContainsString(
            (string) $version['build'],
            $bundle,
            'pos-version.json build id must match the embedded build in the shipped JS bundle.',
        );
        $this->assertStringContainsString(
            (string) $version['commit'],
            $bundle,
            'pos-version.json commit must match the embedded build in the shipped JS bundle.',
        );
    }
}
