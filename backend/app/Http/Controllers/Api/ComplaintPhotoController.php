<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Complaints\Services\ComplaintPhotoService;
use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\Invoice;
use App\Models\Receipt;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ComplaintPhotoController extends Controller
{
    public function __construct(
        private readonly ComplaintPhotoService $photos,
    ) {}

    public function uploadForReceipt(Request $request, string $token): JsonResponse
    {
        $receipt = Receipt::query()->where('token', $token)->first();
        if (! $receipt) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        return $this->upload($request, hash('sha256', $token));
    }

    public function uploadForInvoice(Request $request, string $token): JsonResponse
    {
        $invoice = Invoice::query()->where('token', $token)->first();
        if (! $invoice) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        return $this->upload($request, hash('sha256', $token));
    }

    public function showStaff(int $id)
    {
        $complaint = Complaint::query()->findOrFail($id);
        abort_unless(is_string($complaint->photo_path) && $complaint->photo_path !== '', 404);

        return $this->photos->streamForStaff($complaint->photo_path);
    }

    private function upload(Request $request, string $tokenHash): JsonResponse
    {
        $request->validate([
            'photo' => ['required', 'file', 'image', 'max:5120'],
        ]);

        try {
            $stored = $this->photos->store(
                $request->file('photo'),
                $tokenHash,
                (string) $request->ip(),
            );
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Throwable) {
            return response()->json(['message' => 'Photo upload failed.'], 422);
        }

        return response()->json([
            'upload_id' => $stored['upload_id'],
        ], 201);
    }
}
