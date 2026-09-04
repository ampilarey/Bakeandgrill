<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Inventory\Services\StockCountSessionService;
use App\Domains\Permissions\Services\PermissionService;
use App\Http\Controllers\Controller;
use App\Models\StockCountSession;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Stocktake sessions: open, count, submit, review, post.
 *
 * The blind rule is enforced in the service's `linesFor()`, not here and not
 * in the client — while a sheet is open the expected quantity is simply not in
 * the payload, whoever is asking.
 */
class StockCountSessionController extends Controller
{
    public function __construct(
        private readonly StockCountSessionService $sessions,
    ) {}

    private function canReview(?User $user): bool
    {
        return $user !== null
            && app(PermissionService::class)->hasPermission($user, 'inventory.stock_count.post');
    }

    private function isOwner(?User $user): bool
    {
        return $user !== null && ($user->role?->slug === 'owner');
    }

    public function index(Request $request): JsonResponse
    {
        $sessions = StockCountSession::with(['category:id,name', 'opener:id,name', 'submitter:id,name', 'poster:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->query('status')))
            ->orderByDesc('opened_at')
            ->paginate(min(50, max(5, (int) $request->input('per_page', 20))));

        return response()->json($sessions);
    }

    /** The one sheet a counter can be working on, if there is one. */
    public function active(Request $request): JsonResponse
    {
        $session = StockCountSession::with(['category:id,name', 'opener:id,name', 'submitter:id,name'])
            ->whereIn('status', [StockCountSession::STATUS_OPEN, StockCountSession::STATUS_SUBMITTED])
            ->orderByDesc('opened_at')
            ->first();

        if ($session === null) {
            return response()->json(['session' => null]);
        }

        return $this->show($request, (string) $session->id);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $session = StockCountSession::with(['category:id,name', 'opener:id,name', 'submitter:id,name', 'poster:id,name'])
            ->findOrFail((int) $id);
        $canReview = $this->canReview($request->user());

        return response()->json([
            'session' => $session,
            'lines' => $this->sessions->linesFor($session, $canReview),
            'can_review' => $canReview,
            // Only meaningful once submitted; absent while the sheet is blind.
            'variance_value_mvr' => $canReview && $session->status !== StockCountSession::STATUS_OPEN
                ? round($this->sessions->totalVarianceValue($session), 2)
                : null,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'inventory_category_id' => 'nullable|integer|exists:inventory_categories,id',
            'note' => 'nullable|string|max:500',
        ]);

        $session = $this->sessions->open(
            $request->user(),
            $validated['inventory_category_id'] ?? null,
            $validated['note'] ?? null,
            $request,
        );

        return response()->json([
            'session' => $session,
            'lines' => $this->sessions->linesFor($session, false),
        ], 201);
    }

    public function saveCounts(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'entries' => 'required|array|min:1|max:500',
            'entries.*.line_id' => 'required|integer',
            'entries.*.counted_qty' => 'present|nullable|numeric|min:0|max:9999999',
            'entries.*.note' => 'nullable|string|max:500',
        ]);

        $session = StockCountSession::findOrFail((int) $id);
        $session = $this->sessions->saveCounts($session, $request->user(), $validated['entries'], $request);

        return response()->json([
            'session' => $session,
            'lines' => $this->sessions->linesFor($session, $this->canReview($request->user())),
        ]);
    }

    public function submit(Request $request, string $id): JsonResponse
    {
        $session = StockCountSession::findOrFail((int) $id);
        $session = $this->sessions->submit($session, $request->user(), $request);

        return response()->json([
            'session' => $session,
            'lines' => $this->sessions->linesFor($session, $this->canReview($request->user())),
        ]);
    }

    public function post(Request $request, string $id): JsonResponse
    {
        $session = StockCountSession::findOrFail((int) $id);
        $session = $this->sessions->post(
            $session,
            $request->user(),
            $this->isOwner($request->user()),
            $request,
        );

        return response()->json([
            'session' => $session,
            'lines' => $this->sessions->linesFor($session, true),
        ]);
    }

    /** Reviewer sends it back for one more note, keeping the counts. */
    public function reopen(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate(['note' => 'nullable|string|max:500']);
        $session = StockCountSession::findOrFail((int) $id);
        $session = $this->sessions->reopen($session, $request->user(), $validated['note'] ?? null, $request);

        return response()->json([
            'session' => $session,
            'lines' => $this->sessions->linesFor($session, $this->canReview($request->user())),
        ]);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $session = StockCountSession::findOrFail((int) $id);
        $session = $this->sessions->cancel($session, $request->user(), $request);

        return response()->json(['session' => $session]);
    }
}
