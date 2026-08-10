<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\KitchenProductionBatch;
use App\Models\Media;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\SmsTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Load-bearing controller/service auth that is not on route middleware.
 * Deleting these checks must fail these tests.
 */
class ControllerServiceAuthHardeningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();
        (new SmsTemplateSeeder)->run();
    }

    private function makePlainStaff(string $email): User
    {
        return User::create([
            'name' => 'Plain Staff',
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->value('id'),
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    #[Test]
    public function sms_control_center_requires_settings_manage_or_logs_view(): void
    {
        $denied = $this->makePlainStaff('sms-cc-denied@test.local');
        Sanctum::actingAs($denied, ['staff']);
        $this->getJson('/api/admin/sms/control-center')->assertForbidden();

        $allowed = $this->makePlainStaff('sms-cc-allowed@test.local');
        $allowed->grantPermission('sms.logs.view');
        Sanctum::actingAs($allowed, ['staff']);
        $this->getJson('/api/admin/sms/control-center')->assertOk();
    }

    #[Test]
    public function media_use_as_requires_media_manage_or_website_manage(): void
    {
        Storage::disk('public')->put('library/use-as.jpg', 'fake');
        $media = Media::create([
            'disk' => 'public',
            'path' => 'library/use-as.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 12,
            'width' => 100,
            'height' => 100,
            'source' => 'library',
            'title' => 'use-as.jpg',
        ]);

        $denied = $this->makePlainStaff('media-use-denied@test.local');
        Sanctum::actingAs($denied, ['staff']);
        $this->postJson("/api/admin/media/{$media->id}/use-as", ['key' => 'logo'])->assertForbidden();

        $allowed = $this->makePlainStaff('media-use-allowed@test.local');
        $allowed->grantPermission('media.manage');
        Sanctum::actingAs($allowed, ['staff']);
        $this->postJson("/api/admin/media/{$media->id}/use-as", ['key' => 'logo'])->assertOk();
    }

    #[Test]
    public function video_studio_authorize_studio_gates_capabilities_and_probe(): void
    {
        $denied = $this->makePlainStaff('video-denied@test.local');
        Sanctum::actingAs($denied, ['staff']);
        $this->getJson('/api/admin/media/video/capabilities')->assertForbidden();
        $this->postJson('/api/admin/media/video/probe', ['source_url' => '/storage/x.mp4'])->assertForbidden();

        $viewer = $this->makePlainStaff('video-viewer@test.local');
        $viewer->grantPermission('media.view');
        Sanctum::actingAs($viewer, ['staff']);
        $this->getJson('/api/admin/media/video/capabilities')->assertOk();
        // probe is write-path: media.view alone is not enough
        $this->postJson('/api/admin/media/video/probe', ['source_url' => '/storage/x.mp4'])->assertForbidden();

        $editor = $this->makePlainStaff('video-editor@test.local');
        $editor->grantPermission('media.manage');
        Sanctum::actingAs($editor, ['staff']);
        $this->getJson('/api/admin/media/video/capabilities')->assertOk();
        // Auth passes; missing file may 422 — must not be 403
        $probe = $this->postJson('/api/admin/media/video/probe', ['source_url' => '/storage/missing.mp4']);
        $this->assertNotSame(403, $probe->status());
    }

    #[Test]
    public function cancel_batch_allows_producer_or_kitchen_production_manage(): void
    {
        $producer = $this->makePlainStaff('kp-producer@test.local');
        $other = $this->makePlainStaff('kp-other@test.local');
        $manager = $this->makePlainStaff('kp-manager@test.local');
        $manager->grantPermission('kitchen.production.manage');

        $batch = KitchenProductionBatch::create([
            'batch_no' => 'KP-AUTH-1',
            'status' => 'draft',
            'production_type' => 'prepared_stock',
            'produced_by' => $producer->id,
        ]);
        $batchOtherOwns = KitchenProductionBatch::create([
            'batch_no' => 'KP-AUTH-2',
            'status' => 'draft',
            'production_type' => 'prepared_stock',
            'produced_by' => $producer->id,
        ]);
        $batchForManager = KitchenProductionBatch::create([
            'batch_no' => 'KP-AUTH-3',
            'status' => 'draft',
            'production_type' => 'prepared_stock',
            'produced_by' => $producer->id,
        ]);

        Sanctum::actingAs($producer, ['staff']);
        $this->postJson("/api/kitchen-production/{$batch->id}/cancel", ['reason' => 'mistake'])
            ->assertOk();
        $this->assertSame('cancelled', $batch->fresh()->status);

        Sanctum::actingAs($other, ['staff']);
        $this->postJson("/api/kitchen-production/{$batchOtherOwns->id}/cancel", ['reason' => 'nope'])
            ->assertForbidden();
        $this->assertSame('draft', $batchOtherOwns->fresh()->status);

        Sanctum::actingAs($manager, ['staff']);
        $this->postJson("/api/kitchen-production/{$batchForManager->id}/cancel", ['reason' => 'manager override'])
            ->assertOk();
        $this->assertSame('cancelled', $batchForManager->fresh()->status);
    }
}
