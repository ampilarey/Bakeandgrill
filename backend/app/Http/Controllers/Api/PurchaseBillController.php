<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Inventory\Bills\BillReader;
use App\Domains\Inventory\Bills\BillUnreadable;
use App\Http\Controllers\Controller;
use App\Models\PurchaseBill;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Supplier bills sent in to be read into a manual purchase order
 * (Purchase Orders → Read bills). See App\Domains\Inventory\Bills\BillReader.
 */
class PurchaseBillController extends Controller
{
    /** Asked for each time, not kept: the reader is cheap to build and tests swap it. */
    private function reader(): BillReader
    {
        return app(BillReader::class);
    }

    /** The bills still to check, newest last, and whether reading is set up. */
    public function index(): JsonResponse
    {
        $bills = PurchaseBill::query()->whereIn('status', PurchaseBill::WAITING)->orderBy('id')->limit(200)->get();

        return response()->json([
            'enabled' => $this->reader()->enabled(),
            'bills' => $bills->map(fn (PurchaseBill $b) => $this->reader()->present($b))->values(),
        ]);
    }

    /** Keep one bill. It is read by `read` straight after, or by the scheduler within minutes. */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|max:10240|mimetypes:application/pdf,image/jpeg,image/png,image/webp',
        ], [
            'file.mimetypes' => 'Send a photo (JPG or PNG) or a PDF.',
            'file.max' => 'That file is over 10 MB. Send a smaller photo.',
        ]);
        if (!$this->reader()->enabled()) {
            return response()->json(['message' => 'Bill reading is not set up yet. Add a key under Purchasing → Settings → Reading bills.'], 422);
        }

        $file = $request->file('file');
        try {
            $bill = $this->reader()->keep(
                (string) file_get_contents($file->getRealPath()),
                (string) $file->getClientOriginalName(),
                (string) $file->getMimeType(),
                $request->user()?->id,
            );
        } catch (BillUnreadable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['bill' => $this->reader()->present($bill)], 201);
    }

    /** Read it now (also "Try again" on one that failed). */
    public function read(int $id): JsonResponse
    {
        $bill = PurchaseBill::query()->whereIn('status', PurchaseBill::WAITING)->findOrFail($id);
        @set_time_limit(180);

        return response()->json(['bill' => $this->reader()->present($this->reader()->read($bill))]);
    }

    public function file(int $id): StreamedResponse
    {
        $bill = PurchaseBill::query()->findOrFail($id);
        abort_unless(Storage::disk('local')->exists($bill->file_path), 404);

        return Storage::disk('local')->response($bill->file_path, $bill->file_name, ['Content-Type' => $bill->mime_type]);
    }

    /** Take a bill off the list without entering it. */
    public function destroy(int $id): JsonResponse
    {
        $bill = PurchaseBill::query()->whereIn('status', PurchaseBill::WAITING)->findOrFail($id);
        Storage::disk('local')->delete($bill->file_path);
        $bill->delete();

        return response()->json(['ok' => true]);
    }
}
