<?php

declare(strict_types=1);

namespace Tests\Feature\KitchenProduction;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\KitchenProductionBatch;
use App\Models\KitchenProductionItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttachmentParentOwnershipTest extends TestCase
{
    use RefreshDatabase;

    public function test_production_attachment_rejects_item_from_other_batch(): void
    {
        PermissionCatalogSync::sync();
        Storage::fake('public');

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $user = User::create([
            'name' => 'Attach',
            'email' => 'attach@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $user->grantPermission('kitchen.production.attach_photo');
        $user->grantPermission('kitchen.production.view_all');

        $batchA = KitchenProductionBatch::create([
            'batch_no' => 'KP-A',
            'status' => 'draft',
            'production_type' => 'order',
            'produced_by' => $user->id,
        ]);
        $batchB = KitchenProductionBatch::create([
            'batch_no' => 'KP-B',
            'status' => 'draft',
            'production_type' => 'order',
            'produced_by' => $user->id,
        ]);
        $foreignItem = KitchenProductionItem::create([
            'kitchen_production_batch_id' => $batchB->id,
            'produced_qty' => 1,
            'unit' => 'pcs',
            'status' => 'draft',
        ]);

        Sanctum::actingAs($user, ['staff']);

        $this->post("/api/kitchen-production/{$batchA->id}/attachments", [
            'file' => UploadedFile::fake()->image('photo.jpg'),
            'type' => 'production_photo',
            'kitchen_production_item_id' => $foreignItem->id,
        ])->assertNotFound();
    }
}
