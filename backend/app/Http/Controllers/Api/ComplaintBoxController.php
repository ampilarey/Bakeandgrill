<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Complaints\Services\ComplaintBoxService;
use App\Http\Controllers\Controller;
use App\Models\ComplaintBoxEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** The complaint box as the owner sees it. */
class ComplaintBoxController extends Controller
{
    public function __construct(private readonly ComplaintBoxService $box) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'status' => ['nullable', 'string', Rule::in(array_merge(['open', 'all'], ComplaintBoxEntry::STATUSES))],
            'category' => ['nullable', 'string', Rule::in(array_merge(['staff'], ComplaintBoxEntry::CATEGORIES))],
            'search' => ['nullable', 'string', 'max:100'],
        ]);

        $status = (string) $request->query('status', 'open');
        $category = (string) $request->query('category', '');
        $search = trim((string) $request->query('search', ''));

        $query = ComplaintBoxEntry::query();
        if ($status === 'open') {
            $query->whereIn('status', ComplaintBoxEntry::OPEN_STATUSES);
        } elseif ($status !== 'all') {
            $query->where('status', $status);
        }
        if ($category === 'staff') {
            $query->where(function ($q) {
                foreach (ComplaintBoxEntry::STAFF_CATEGORIES as $c) {
                    $q->orWhere('categories', 'like', '%"' . $c . '"%');
                }
            });
        } elseif ($category !== '') {
            $query->where('categories', 'like', '%"' . $category . '"%');
        }
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('reference_number', 'like', "%{$search}%")
                    ->orWhere('about_staff', 'like', "%{$search}%")
                    ->orWhere('comment', 'like', "%{$search}%")
                    ->orWhere('order_ref', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        // Newest first: the owner is reading the SMS that just arrived.
        $paginator = $query->orderByDesc('created_at')
            ->paginate(min(50, max(1, (int) $request->query('per_page', 25))));

        $open = ComplaintBoxEntry::query()->whereIn('status', ComplaintBoxEntry::OPEN_STATUSES);

        return response()->json([
            'entries' => $paginator,
            'meta' => [
                'open_count' => (clone $open)->count(),
                'new_count' => (clone $open)->where('status', ComplaintBoxEntry::STATUS_NEW)->count(),
                'staff_open_count' => (clone $open)->where(function ($q) {
                    foreach (ComplaintBoxEntry::STAFF_CATEGORIES as $c) {
                        $q->orWhere('categories', 'like', '%"' . $c . '"%');
                    }
                })->count(),
                'this_week_count' => ComplaintBoxEntry::query()->where('created_at', '>=', now()->subDays(7))->count(),
            ],
            'categories' => ComplaintBoxEntry::categoryOptions(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $entry = ComplaintBoxEntry::query()
            ->with(['events.user:id,name', 'resolver:id,name'])
            ->findOrFail($id);

        return response()->json(['entry' => $entry]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(ComplaintBoxEntry::STATUSES)],
            'internal_note' => ['nullable', 'string', 'max:2000'],
            'message' => ['nullable', 'string', 'max:600'],
        ]);

        $entry = ComplaintBoxEntry::query()->findOrFail($id);
        $updated = $this->box->changeStatus(
            $entry,
            $validated['status'],
            $request->user(),
            $validated['internal_note'] ?? null,
            $validated['message'] ?? null,
        );

        return response()->json(['entry' => $updated]);
    }

    public function message(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:600'],
        ]);

        $entry = ComplaintBoxEntry::query()->findOrFail($id);
        $event = $this->box->messageCustomer($entry, $validated['message'], $request->user());

        return response()->json([
            'event' => $event,
            'entry' => $entry->fresh(['events.user:id,name', 'resolver:id,name']),
        ], 201);
    }
}
