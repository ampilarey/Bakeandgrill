<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\DeliveryDriver;
use App\Models\KitchenProductionBatch;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Media audit, 2026-10-01: driver and staff photos were stored exactly as the
 * phone took them, location metadata and all, behind public links.
 */
class AttachmentReencodeTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A real JPEG of the given size with a metadata segment carrying a marker,
     * standing in for the camera's EXIF block (GPS included).
     */
    private function phonePhoto(int $w, int $h): UploadedFile
    {
        $img = imagecreatetruecolor($w, $h);
        imagefill($img, 0, 0, imagecolorallocate($img, 200, 120, 40));
        ob_start();
        imagejpeg($img, null, 90);
        $jpeg = (string) ob_get_clean();
        imagedestroy($img);

        $marker = 'GPS-55.2700N-73.5100E';
        $app1 = "\xFF\xE1" . pack('n', strlen($marker) + 8) . "Exif\0\0" . $marker;
        $withMeta = substr($jpeg, 0, 2) . $app1 . substr($jpeg, 2);

        $path = tempnam(sys_get_temp_dir(), 'ph') . '.jpg';
        file_put_contents($path, $withMeta);

        return new UploadedFile($path, 'IMG_0001.jpg', 'image/jpeg', null, true);
    }

    public function test_a_delivery_proof_loses_its_location_is_resized_and_replaces_the_last_one(): void
    {
        Storage::fake('public');
        $driver = DeliveryDriver::create(['name' => 'Ali', 'phone' => '7999111', 'pin' => bcrypt('1234'), 'is_active' => true]);
        $order = Order::factory()->create(['type' => 'delivery', 'status' => 'on_the_way', 'delivery_driver_id' => $driver->id]);
        $token = $driver->createToken('t', ['driver'])->plainTextToken;

        $this->withToken($token)->postJson("/api/driver/deliveries/{$order->id}/proof", ['photo' => $this->phonePhoto(3000, 2000)])->assertOk();
        $first = $order->fresh()->proof_of_delivery_path;

        $bytes = Storage::disk('public')->get($first);
        $this->assertStringNotContainsString('GPS-55.2700N', $bytes, 'the location is gone');
        [$w, $h] = getimagesizefromstring($bytes);
        $this->assertSame(1600, max($w, $h));

        $this->withToken($token)->postJson("/api/driver/deliveries/{$order->id}/proof", ['photo' => $this->phonePhoto(800, 600)])->assertOk();
        $this->assertFalse(Storage::disk('public')->exists($first), 'a retaken proof replaces the old file');
    }

    public function test_kitchen_photos_are_reencoded_and_pdfs_are_kept(): void
    {
        PermissionCatalogSync::sync();
        Storage::fake('public');
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $user = User::create([
            'name' => 'Cook', 'email' => 'cook@test.local', 'password' => Hash::make('password'),
            'role_id' => $role->id, 'pin_hash' => Hash::make('4826'), 'is_active' => true,
        ]);
        $user->grantPermission('kitchen.production.attach_photo');
        $batch = KitchenProductionBatch::create(['batch_no' => 'KP-1', 'status' => 'draft', 'production_type' => 'order', 'produced_by' => $user->id]);
        Sanctum::actingAs($user, ['staff']);

        $this->post("/api/kitchen-production/{$batch->id}/attachments", ['file' => $this->phonePhoto(4000, 3000), 'type' => 'production_photo'])
            ->assertCreated();
        $photo = $batch->attachments()->latest('id')->first();
        $this->assertStringEndsWith('.jpg', $photo->file_path);
        $this->assertSame('image/jpeg', $photo->mime_type);
        $bytes = Storage::disk('public')->get($photo->file_path);
        $this->assertStringNotContainsString('GPS-55.2700N', $bytes);
        $this->assertSame(2000, max(getimagesizefromstring($bytes)[0], getimagesizefromstring($bytes)[1]));

        $this->post("/api/kitchen-production/{$batch->id}/attachments", [
            'file' => UploadedFile::fake()->createWithContent('invoice.pdf', "%PDF-1.4\n%%EOF\n"),
            'type' => 'other',
        ])->assertCreated();
        $this->assertStringEndsWith('.pdf', $batch->attachments()->latest('id')->first()->file_path);
    }
}
