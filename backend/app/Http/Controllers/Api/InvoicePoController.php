<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * A customer's purchase order behind an invoice (owner, 2026-11-15: "a place
 * where I can upload PO and generate invoice").
 *
 * The PO is read in the browser (Finance → Invoices → From a PO), so the server
 * needs no PDF software: it keeps the file, says when a PO number has been
 * invoiced before, and hands the file back to staff. The invoice itself is made
 * by `InvoiceController::store`, the one place an invoice is created by hand.
 */
class InvoicePoController extends Controller
{
    /** Where PO files are kept, on the private disk. */
    public const DIRECTORY = 'invoice-pos';

    private const PATH = '#^invoice-pos/\d{4}/\d{2}/[0-9a-f-]{36}\.(pdf|jpg|png)$#';

    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpg,jpeg,png'],
        ]);

        $file = $request->file('file');
        $ext = match (strtolower((string) $file->getMimeType())) {
            'application/pdf' => 'pdf',
            'image/png' => 'png',
            default => 'jpg',
        };
        $path = self::DIRECTORY . '/' . now()->format('Y/m') . '/' . Str::uuid()->toString() . '.' . $ext;
        Storage::disk('local')->put($path, (string) file_get_contents((string) $file->getRealPath()));

        return response()->json(['path' => $path], 201);
    }

    /** Invoices already made for this PO number, so one PO is not billed twice by mistake. */
    public function check(Request $request): JsonResponse
    {
        $number = trim((string) $request->query('po_number', ''));
        if ($number === '') {
            return response()->json(['invoices' => []]);
        }

        $rows = Invoice::query()
            ->where('po_number', $number)
            ->where('status', '!=', 'void')
            ->orderByDesc('id')
            ->limit(5)
            ->get(['id', 'invoice_number', 'issue_date', 'total', 'status']);

        return response()->json([
            'invoices' => $rows->map(fn (Invoice $i) => [
                'id' => $i->id,
                'invoice_number' => $i->invoice_number,
                'issue_date' => $i->issue_date?->toDateString(),
                'total' => (float) $i->total,
                'status' => $i->status,
            ])->all(),
        ]);
    }

    public function download(int $id): StreamedResponse
    {
        $invoice = Invoice::findOrFail($id);
        $path = (string) $invoice->po_file_path;
        if ($path === '' || !Storage::disk('local')->exists($path)) {
            abort(404, 'This invoice has no purchase order file.');
        }
        $ext = pathinfo($path, PATHINFO_EXTENSION);
        $name = 'PO-' . (preg_replace('/[^A-Za-z0-9_-]+/', '-', (string) ($invoice->po_number ?: $invoice->invoice_number)) ?: 'file') . '.' . $ext;

        return Storage::disk('local')->download($path, $name);
    }

    /**
     * The path an invoice may keep: one this controller made, still on disk.
     * Anything else is refused, so a typed path can never point at another file.
     */
    public static function checkedPath(?string $path): ?string
    {
        $path = trim((string) $path);
        if ($path === '') {
            return null;
        }
        if (!preg_match(self::PATH, $path) || !Storage::disk('local')->exists($path)) {
            throw ValidationException::withMessages(['po_file' => ['The purchase order file was not found. Upload it again.']]);
        }

        return $path;
    }
}
