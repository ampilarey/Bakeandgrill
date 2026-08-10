<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Complaints\Services\ComplaintService;
use App\Http\Controllers\Controller;
use App\Models\Complaint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ComplaintController extends Controller
{
    public function __construct(
        private readonly ComplaintService $complaints,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status');
        $openOnly = $request->boolean('open', $status === null || $status === 'open');

        $query = Complaint::query()
            ->with(['order:id,order_number,total,customer_id', 'customer:id,name,phone', 'cashier:id,name'])
            ->withCount('items');

        if ($status && $status !== 'open' && $status !== 'all') {
            $query->where('status', $status);
        } elseif ($openOnly && $status !== 'all') {
            $query->whereNotIn('status', Complaint::CLOSED_STATUSES);
        }

        // Food-safety pinned first, then oldest open first.
        $query->orderByDesc('is_food_safety')
            ->orderBy('created_at');

        $paginator = $query->paginate(min(50, max(1, (int) $request->query('per_page', 25))));

        $openQuery = Complaint::query()->whereNotIn('status', Complaint::CLOSED_STATUSES);
        $openCount = (clone $openQuery)->count();
        $oldest = (clone $openQuery)->orderBy('created_at')->first();
        $oldestAgeMinutes = $oldest
            ? (int) $oldest->created_at->diffInMinutes(now())
            : null;

        return response()->json([
            'complaints' => $paginator,
            'meta' => [
                'open_count' => $openCount,
                'oldest_open_age_minutes' => $oldestAgeMinutes,
                'oldest_open_reference' => $oldest?->reference_number,
            ],
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $complaint = Complaint::query()
            ->with([
                'order.items',
                'customer',
                'cashier:id,name',
                'items',
                'statusHistories.changedBy:id,name',
                'contactLogs.loggedBy:id,name',
                'receipt:id,token,order_id',
                'invoice:id,invoice_number,token',
            ])
            ->findOrFail($id);

        return response()->json(['complaint' => $complaint]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:'.implode(',', Complaint::STATUSES)],
            'internal_note' => ['nullable', 'string', 'max:2000'],
            'resolution_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $complaint = Complaint::query()->findOrFail($id);
        $updated = $this->complaints->changeStatus(
            $complaint,
            $validated['status'],
            $request->user(),
            $validated['internal_note'] ?? null,
            $validated['resolution_note'] ?? null,
        );

        return response()->json(['complaint' => $updated]);
    }

    public function addContactLog(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'channel' => ['required', 'string', 'in:phone,whatsapp,in_person'],
            'note' => ['required', 'string', 'max:5000'],
        ]);

        $complaint = Complaint::query()->findOrFail($id);
        $log = $this->complaints->addContactLog(
            $complaint,
            $validated['channel'],
            $validated['note'],
            $request->user(),
        );

        return response()->json(['contact_log' => $log->load('loggedBy:id,name')], 201);
    }
}
