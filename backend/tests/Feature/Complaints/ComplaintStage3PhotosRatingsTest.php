<?php

declare(strict_types=1);

namespace Tests\Feature\Complaints;

use App\Domains\Complaints\Services\ComplaintPhotoService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Complaint;
use App\Models\OrderItem;
use App\Models\Receipt;
use App\Models\Review;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ComplaintStage3PhotosRatingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Storage::fake('local');
        $this->makeOwner(['phone' => '+9607700100']);
    }

    private function paidReceipt(): Receipt
    {
        $customer = $this->makeCustomer([
            'phone' => '+9607'.str_pad((string) random_int(100000, 999999), 6, '0'),
            'sms_opt_out' => false,
        ]);
        $order = $this->makePaidOrder($customer, [
            'order_number' => 'BG-S3-'.Str::upper(Str::random(4)),
            'type' => 'pickup',
            'total' => 30,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_name' => 'Grill plate',
            'quantity' => 1,
            'unit_price' => 30,
            'total_price' => 30,
        ]);

        return Receipt::create([
            'order_id' => $order->id,
            'token' => Str::random(48),
            'channel' => 'sms',
            'recipient' => $customer->phone,
        ]);
    }

    private function jpegWithGpsExif(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'cphoto').'.jpg';
        $im = imagecreatetruecolor(64, 48);
        $bg = imagecolorallocate($im, 200, 40, 40);
        imagefill($im, 0, 0, $bg);
        imagejpeg($im, $path, 90);
        imagedestroy($im);

        $jpeg = (string) file_get_contents($path);
        $this->assertTrue(str_starts_with($jpeg, "\xFF\xD8"));

        // Minimal GPS EXIF (APP1) so exif_read_data reports GPSLatitude.
        $gpsIfdOffset = 8 + 2 + 12 + 4; // after IFD0 with 1 entry pointing to GPS
        $tiff = "II\x2A\x00\x08\x00\x00\x00" // II, 42, IFD0 @8
            ."\x01\x00" // 1 IFD0 entry
            ."\x25\x88\x04\x00\x01\x00\x00\x00" // GPS IFD Pointer (0x8825), LONG
            .pack('V', $gpsIfdOffset)
            ."\x00\x00\x00\x00" // next IFD
            ."\x01\x00" // 1 GPS entry
            ."\x01\x00\x02\x00\x02\x00\x00\x00" // GPSLatitudeRef ASCII count 2
            ."N\x00\x00\x00" // value "N\0"
            ."\x00\x00\x00\x00"; // next

        $exifPayload = "Exif\x00\x00".$tiff;
        $app1 = "\xFF\xE1".pack('n', strlen($exifPayload) + 2).$exifPayload;
        $out = "\xFF\xD8".$app1.substr($jpeg, 2);
        file_put_contents($path, $out);

        $read = @exif_read_data($path);
        if ($read === false || empty($read['GPSLatitudeRef'])) {
            @unlink($path);
            $this->markTestSkipped('Could not embed readable GPS EXIF on this runtime');
        }

        return $path;
    }

    public function test_exif_including_gps_is_stripped_on_upload(): void
    {
        $receipt = $this->paidReceipt();
        $src = $this->jpegWithGpsExif();

        $response = $this->post('/api/receipts/'.$receipt->token.'/complaint-photos', [
            'photo' => new UploadedFile($src, 'with-gps.jpg', 'image/jpeg', null, true),
        ], [
            'Accept' => 'application/json',
        ]);

        @unlink($src);

        $response->assertCreated();
        $uploadId = $response->json('upload_id');
        $this->assertIsString($uploadId);

        $path = app(ComplaintPhotoService::class)->pathForUploadId($uploadId);
        $this->assertNotNull($path);
        $stored = Storage::disk('local')->get($path);
        $this->assertNotFalse($stored);

        $tmp = tempnam(sys_get_temp_dir(), 'stripped').'.jpg';
        file_put_contents($tmp, $stored);
        $exif = @exif_read_data($tmp);
        @unlink($tmp);

        $this->assertTrue($exif === false || empty($exif['GPSLatitudeRef']), 'GPS EXIF must be stripped');
        $this->assertTrue($exif === false || empty($exif['GPSLatitude']), 'GPS coordinates must be stripped');
    }

    public function test_unauthenticated_photo_fetch_fails(): void
    {
        $receipt = $this->paidReceipt();
        $file = UploadedFile::fake()->image('food.jpg', 200, 160);
        $upload = $this->post('/api/receipts/'.$receipt->token.'/complaint-photos', [
            'photo' => $file,
        ], ['Accept' => 'application/json'])->assertCreated();

        $complaint = $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_FOOD_QUALITY],
            'photo_upload_id' => $upload->json('upload_id'),
            'idempotency_key' => 'photo-1',
        ])->assertCreated();

        $id = Complaint::query()->where('reference_number', $complaint->json('complaint.reference_number'))->value('id');
        $this->assertNotNull($id);

        $this->getJson('/api/complaints/'.$id.'/photo')->assertUnauthorized();
    }

    public function test_staff_with_permission_can_fetch_photo(): void
    {
        $receipt = $this->paidReceipt();
        $owner = $this->makeOwner(['phone' => '+9607700222']);
        $file = UploadedFile::fake()->image('plate.jpg', 180, 140);
        $upload = $this->post('/api/receipts/'.$receipt->token.'/complaint-photos', [
            'photo' => $file,
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_WRONG_ITEM],
            'photo_upload_id' => $upload->json('upload_id'),
            'idempotency_key' => 'photo-2',
        ])->assertCreated();

        $complaint = Complaint::query()->firstOrFail();
        $this->assertNotNull($complaint->photo_path);

        Sanctum::actingAs($owner, ['staff']);
        $this->get('/api/complaints/'.$complaint->id.'/photo')
            ->assertOk()
            ->assertHeader('Content-Type', 'image/jpeg');
    }

    public function test_upload_failure_still_saves_complaint(): void
    {
        $receipt = $this->paidReceipt();

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_MISSING_ITEM],
            'photo_upload_id' => '00000000-0000-0000-0000-000000000099',
            'idempotency_key' => 'bad-photo',
        ])->assertCreated();

        $complaint = Complaint::query()->firstOrFail();
        $this->assertNull($complaint->photo_path);
        $this->assertSame(Complaint::CATEGORY_MISSING_ITEM, $complaint->categoryList()[0]);
    }

    public function test_receipt_uses_stars_not_select_and_review_invite_is_optional(): void
    {
        $receipt = $this->paidReceipt();
        $html = $this->get('/receipts/'.$receipt->token)->assertOk()->getContent();

        $this->assertStringContainsString('data-star=', $html);
        $this->assertStringContainsString('data-review-invite', $html);
        $this->assertStringContainsString('Leave a public review', $html);
        $this->assertStringNotContainsString('<select name="rating"', $html);
        // Invite must not POST a review from the public receipt page.
        $this->assertStringNotContainsString('/api/reviews', $html);
        $this->assertStringNotContainsString('POST /reviews', $html);
    }

    public function test_feedback_does_not_create_public_review(): void
    {
        $receipt = $this->paidReceipt();
        $before = Review::query()->count();

        $this->post('/receipts/'.$receipt->token.'/feedback', [
            'rating' => 5,
            'comments' => 'Great food',
        ])->assertRedirect();

        $this->assertSame($before, Review::query()->count());
    }

    public function test_low_star_script_opens_something_else_complaint(): void
    {
        $receipt = $this->paidReceipt();
        $html = $this->get('/receipts/'.$receipt->token)->assertOk()->getContent();
        $this->assertStringContainsString("openComplaint('something_else')", $html);
    }
}
