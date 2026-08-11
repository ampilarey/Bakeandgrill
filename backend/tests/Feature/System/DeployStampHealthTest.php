<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Support\DeployStamp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeployStampHealthTest extends TestCase
{
    use RefreshDatabase;

    private string $stampPath;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->stampPath = storage_path('app/'.DeployStamp::RELATIVE_PATH);
        if (is_file($this->stampPath)) {
            unlink($this->stampPath);
        }
    }

    protected function tearDown(): void
    {
        if (is_file($this->stampPath)) {
            unlink($this->stampPath);
        }
        parent::tearDown();
    }

    public function test_public_health_returns_unknown_when_stamp_absent(): void
    {
        $this->assertFileDoesNotExist($this->stampPath);

        $this->getJson('/api/health')
            ->assertOk()
            ->assertExactJson(['status' => 'ok', 'commit' => 'unknown']);
    }

    public function test_public_health_returns_short_sha_when_stamp_present(): void
    {
        $this->writeStamp([
            'commit' => 'abcdef0123456789abcdef0123456789abcdef01',
            'commit_short' => 'abcdef0',
            'branch' => 'main',
            'deployed_at' => '2026-08-11T06:00:00Z',
        ]);

        $data = $this->getJson('/api/health')->assertOk()->json();

        $this->assertSame(['status', 'commit'], array_keys($data));
        $this->assertSame('ok', $data['status']);
        $this->assertSame('abcdef0', $data['commit']);
        $this->assertArrayNotHasKey('branch', $data);
        $this->assertArrayNotHasKey('deployed_at', $data);
        $this->assertArrayNotHasKey('environment', $data);
    }

    public function test_admin_detailed_includes_full_deploy_stamp(): void
    {
        $this->writeStamp([
            'commit' => 'abcdef0123456789abcdef0123456789abcdef01',
            'commit_short' => 'abcdef0',
            'branch' => 'main',
            'deployed_at' => '2026-08-11T06:00:00Z',
        ]);

        $owner = $this->makeOwner();
        Sanctum::actingAs($owner, ['staff']);

        $this->getJson('/api/admin/system/health/detailed')
            ->assertOk()
            ->assertJsonPath('deploy.commit_short', 'abcdef0')
            ->assertJsonPath('deploy.branch', 'main')
            ->assertJsonPath('deploy.deployed_at', '2026-08-11T06:00:00Z')
            ->assertJsonPath('deploy.commit', 'abcdef0123456789abcdef0123456789abcdef01');
    }

    /** @param array<string, string> $payload */
    private function writeStamp(array $payload): void
    {
        File::ensureDirectoryExists(dirname($this->stampPath));
        file_put_contents($this->stampPath, json_encode($payload, JSON_THROW_ON_ERROR));
    }
}
