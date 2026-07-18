<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\CorporateInquiry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class CorporateInquiryController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company' => ['nullable', 'string', 'max:200'],
            'contact_name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:190'],
            'event_date' => ['nullable', 'date', 'after_or_equal:today'],
            'headcount' => ['nullable', 'integer', 'min:1', 'max:5000'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $inquiry = CorporateInquiry::create([
            ...$validated,
            'status' => 'new',
        ]);

        return response()->json([
            'message' => 'Thanks — we will contact you shortly.',
            'inquiry' => [
                'id' => $inquiry->id,
                'created_at' => $inquiry->created_at?->toIso8601String(),
            ],
        ], 201);
    }

    public function adminIndex(Request $request): JsonResponse
    {
        $paginator = CorporateInquiry::query()
            ->orderByDesc('created_at')
            ->paginate(min(50, max(10, (int) $request->input('per_page', 20))));

        return response()->json([
            'data' => collect($paginator->items())->map(fn (CorporateInquiry $row) => $this->format($row)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:new,contacted,closed'],
        ]);

        $inquiry = CorporateInquiry::query()->findOrFail($id);
        $inquiry->update(['status' => $validated['status']]);

        return response()->json(['inquiry' => $this->format($inquiry->fresh())]);
    }

    /** @return array<string, mixed> */
    private function format(CorporateInquiry $row): array
    {
        return [
            'id' => $row->id,
            'company' => $row->company,
            'contact_name' => $row->contact_name,
            'phone' => $row->phone,
            'email' => $row->email,
            'event_date' => $row->event_date?->toDateString(),
            'headcount' => $row->headcount,
            'notes' => $row->notes,
            'status' => $row->status,
            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }
}
