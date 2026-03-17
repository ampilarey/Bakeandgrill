<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ReviewController extends Controller
{
    // ── Public: list reviews for an item ─────────────────────────────────────

    public function itemReviews(int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);

        // Compute avg + count at the DB level — not on an already-limited PHP collection
        $stats = Review::where('item_id', $item->id)
            ->where('status', 'approved')
            ->selectRaw('COUNT(*) as review_count, ROUND(AVG(rating), 1) as average_rating')
            ->first();

        $reviews = Review::where('item_id', $item->id)
            ->where('status', 'approved')
            ->with('customer:id,name')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        return response()->json([
            'average_rating' => $stats->average_rating ? (float) $stats->average_rating : null,
            'review_count'   => (int) $stats->review_count,
            'reviews'        => $reviews->map(fn(Review $r) => $this->format($r)),
        ]);
    }

    // ── Customer: submit a review ─────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_id'     => ['required', 'integer', 'exists:orders,id'],
            'rating'       => ['required', 'integer', 'min:1', 'max:5'],
            'comment'      => ['nullable', 'string', 'max:1000'],
            'type'         => ['sometimes', 'in:order,item'],
            'item_id'      => ['nullable', 'integer', 'exists:items,id'],
            'is_anonymous' => ['sometimes', 'boolean'],
        ]);

        $user = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (! $user instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $customerId = $user->id;

        // Only allow reviewing completed/paid orders the customer owns
        $order = Order::findOrFail($validated['order_id']);
        if ($order->customer_id !== $customerId) {
            return response()->json(['message' => 'You can only review your own orders.'], 403);
        }

        if (!in_array($order->status, ['completed', 'paid'], true)) {
            return response()->json(['message' => 'You can only review completed orders.'], 422);
        }

        $review = Review::updateOrCreate(
            [
                'customer_id' => $customerId,
                'order_id'    => $validated['order_id'],
                'item_id'     => $validated['item_id'] ?? null,
            ],
            [
                'rating'       => $validated['rating'],
                'comment'      => $validated['comment'] ?? null,
                'type'         => $validated['type'] ?? ($validated['item_id'] ? 'item' : 'order'),
                'is_anonymous' => (bool) ($validated['is_anonymous'] ?? false),
                'status'       => 'pending',
            ],
        );

        return response()->json(['review' => $this->format($review)], 201);
    }

    // ── Customer: list own reviews ────────────────────────────────────────────

    public function myReviews(Request $request): JsonResponse
    {
        $user = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (! $user instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $reviews = Review::where('customer_id', $user->id)
            ->with('item:id,name', 'order:id,order_number')
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['reviews' => $reviews->map(fn(Review $r) => $this->format($r))]);
    }

    // ── Admin: list + moderate ────────────────────────────────────────────────

    public function adminIndex(Request $request): JsonResponse
    {
        $query = Review::with('customer:id,name', 'item:id,name', 'order:id,order_number')
            ->orderByDesc('created_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        $paginator = $query->paginate(20);

        return response()->json([
            'data' => collect($paginator->items())->map(fn(Review $r) => $this->format($r)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    public function moderate(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate(['status' => ['required', 'in:approved,rejected']]);

        $review = Review::findOrFail($id);
        $review->update(['status' => $validated['status']]);

        return response()->json(['review' => $this->format($review)]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function format(Review $r): array
    {
        return [
            'id'           => $r->id,
            'rating'       => $r->rating,
            'comment'      => $r->comment,
            'type'         => $r->type,
            'status'       => $r->status,
            'is_anonymous' => $r->is_anonymous,
            'author'       => $r->is_anonymous ? 'Anonymous' : ($r->customer?->name ?? 'Guest'),
            'item'         => $r->item   ? ['id' => $r->item->id,  'name' => $r->item->name]  : null,
            'order'        => $r->order  ? ['id' => $r->order->id, 'order_number' => $r->order->order_number] : null,
            'created_at'   => $r->created_at,
        ];
    }
}
