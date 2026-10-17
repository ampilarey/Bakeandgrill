<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Reviews\ReviewPhotos;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Review;
use App\Models\ReviewVote;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class ReviewController extends Controller
{
    public const TYPE_REPLY = 'customer_review_reply';

    public function __construct(private readonly ReviewPhotos $photos) {}

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
            ->with('customer:id,name', 'item:id,name', 'order:id,order_number')
            // Most helpful first, then newest (feature 6).
            ->orderByDesc('helpful_count')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        return response()->json([
            'average_rating' => $stats->average_rating ? (float) $stats->average_rating : null,
            'review_count' => (int) $stats->review_count,
            'reviews' => $reviews->map(fn (Review $r) => $this->format($r)),
        ]);
    }

    /** Public featured reviews for homepage social proof. */
    public function featured(Request $request): JsonResponse
    {
        $limit = min(12, max(3, (int) $request->query('limit', 6)));

        $reviews = Review::query()
            ->where('status', 'approved')
            ->whereNotNull('comment')
            ->where('comment', '!=', '')
            ->with(['customer:id,name', 'item:id,name', 'order:id,order_number'])
            ->orderByDesc('rating')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        return response()->json([
            'reviews' => $reviews->map(fn (Review $r) => $this->format($r)),
        ]);
    }

    // ── Customer: submit a review ─────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_id' => ['required', 'integer', 'exists:orders,id'],
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:1000'],
            'type' => ['sometimes', 'in:order,item'],
            'item_id' => ['nullable', 'integer', 'exists:items,id'],
            'is_anonymous' => ['sometimes', 'boolean'],
            'photos' => ['sometimes', 'array', 'max:' . ReviewPhotos::MAX],
            'photos.*' => ['file', 'image', 'max:5120'],
        ]);

        $user = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (!$user instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $customerId = $user->id;

        // Only allow reviewing completed/paid orders the customer owns
        $order = Order::findOrFail($validated['order_id']);
        if ($order->customer_id !== $customerId) {
            return response()->json(['message' => 'You can only review your own orders.'], 403);
        }

        if (!in_array($order->status, ['completed', 'paid', 'delivered'], true)) {
            return response()->json(['message' => 'You can only review completed orders.'], 422);
        }

        $review = Review::query()->firstOrNew([
            'customer_id' => $customerId,
            'order_id' => $validated['order_id'],
            'item_id' => $validated['item_id'] ?? null,
        ]);
        $review->fill([
            'rating' => $validated['rating'],
            'comment' => $validated['comment'] ?? null,
            'type' => $validated['type'] ?? (($validated['item_id'] ?? null) ? 'item' : 'order'),
            'is_anonymous' => (bool) ($validated['is_anonymous'] ?? false),
            // Every review, with photos or without, waits for staff.
            'status' => 'pending',
        ]);
        // New photos replace the old ones; none sent keeps what is there.
        $files = array_values(array_filter((array) $request->file('photos', [])));
        if ($files !== []) {
            $old = $review->photos;
            $review->photos = array_map(fn ($file) => $this->photos->store($file), $files);
            $review->save();
            $this->photos->delete($old);
        } else {
            $review->save();
        }

        return response()->json(['review' => $this->format($review)], 201);
    }

    // ── Customer: list own reviews ────────────────────────────────────────────

    public function myReviews(Request $request): JsonResponse
    {
        $user = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (!$user instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $reviews = Review::where('customer_id', $user->id)
            ->with('item:id,name', 'order:id,order_number')
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['reviews' => $reviews->map(fn (Review $r) => $this->format($r))]);
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
            'data' => collect($paginator->items())->map(fn (Review $r) => $this->format($r)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
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

    /** POST /api/admin/reviews/{id}/reply: the restaurant's answer, shown under the review (feature 6). */
    public function reply(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate(['reply' => ['present', 'nullable', 'string', 'max:1000']]);
        $review = Review::with('customer')->findOrFail($id);
        $text = trim((string) ($validated['reply'] ?? ''));
        $first = blank($review->reply);
        $user = $request->user();
        $review->forceFill([
            'reply' => $text !== '' ? $text : null,
            'replied_at' => $text !== '' ? now() : null,
            'replied_by' => $text !== '' && $user instanceof User ? $user->id : null,
        ])->save();
        if ($text !== '' && $first) {
            $this->tellCustomer($review);
        }

        return response()->json(['review' => $this->format($review->fresh(['customer', 'item', 'order']))]);
    }

    /** POST /api/reviews/{id}/helpful: once per customer, never on their own review. */
    public function helpful(Request $request, int $id): JsonResponse
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403);
        $review = Review::query()->where('status', 'approved')->findOrFail($id);
        if ((int) $review->customer_id === (int) $customer->id) {
            return response()->json(['message' => 'You cannot vote on your own review.'], 422);
        }
        try {
            DB::transaction(function () use ($review, $customer): void {
                ReviewVote::query()->create(['review_id' => $review->id, 'customer_id' => $customer->id]);
                Review::query()->whereKey($review->id)->increment('helpful_count');
            });
        } catch (UniqueConstraintViolationException) {
            // Already counted.
        }

        return response()->json(['helpful_count' => (int) $review->fresh()?->helpful_count, 'voted' => true]);
    }

    /** GET /api/reviews/{id}/photos/{n}: approved reviews only; ?thumb=1 for the small one. */
    public function photo(Request $request, int $id, int $n): Response
    {
        $review = Review::query()->where('status', 'approved')->findOrFail($id);

        return $this->streamPhoto($review, $n, $request->boolean('thumb'), true);
    }

    /** GET /api/admin/reviews/{id}/photos/{n}: any review, for moderation. */
    public function adminPhoto(Request $request, int $id, int $n): Response
    {
        return $this->streamPhoto(Review::findOrFail($id), $n, $request->boolean('thumb'), false);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function streamPhoto(Review $review, int $n, bool $thumb, bool $public): Response
    {
        $photo = ($review->photos ?? [])[$n] ?? null;
        abort_unless(is_array($photo), 404);

        return $this->photos->stream((string) ($thumb ? ($photo['thumb'] ?? $photo['path']) : $photo['path']), $public);
    }

    private function tellCustomer(Review $review): void
    {
        $customer = $review->customer;
        if ($customer === null || blank($customer->phone) || !AlertSwitch::isOn(self::TYPE_REPLY)) {
            return;
        }
        $url = rtrim((string) config('app.url'), '/') . '/order/account';
        try {
            app(SmsService::class)->send(new SmsMessage(
                to: (string) $customer->phone,
                message: 'Bake & Grill replied to your review: "' . Str::limit((string) $review->reply, 90) . "\" See it: {$url}",
                type: self::TYPE_REPLY,
                customerId: $customer->id,
                referenceType: 'review',
                referenceId: (string) $review->id,
                idempotencyKey: 'review-reply:' . $review->id,
            ));
        } catch (\Throwable $e) {
            Log::warning('Review reply could not be sent', ['review_id' => $review->id, 'error' => $e->getMessage()]);
        }
    }

    private function format(Review $r): array
    {
        return [
            'id' => $r->id,
            'rating' => $r->rating,
            'comment' => $r->comment,
            'type' => $r->type,
            'status' => $r->status,
            'is_anonymous' => $r->is_anonymous,
            'author' => $r->is_anonymous ? 'Anonymous' : ($r->customer?->name ?? 'Guest'),
            'item' => $r->item ? ['id' => $r->item->id,  'name' => $r->item->name] : null,
            'order' => $r->order ? ['id' => $r->order->id, 'order_number' => $r->order->order_number] : null,
            'created_at' => $r->created_at,
            'verified' => $r->isVerified(),
            'photos' => array_map(fn (int $n) => [
                'url' => "/api/reviews/{$r->id}/photos/{$n}",
                'thumb_url' => "/api/reviews/{$r->id}/photos/{$n}?thumb=1",
            ], array_keys(array_values($r->photos ?? []))),
            'helpful_count' => (int) $r->helpful_count,
            'reply' => $r->reply !== null ? ['text' => $r->reply, 'at' => $r->replied_at] : null,
        ];
    }
}
