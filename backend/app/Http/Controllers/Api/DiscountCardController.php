<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Promotions\Services\DiscountCardIssueService;
use App\Http\Controllers\Controller;
use App\Models\DiscountCardBatch;
use App\Models\Promotion;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class DiscountCardController extends Controller
{
    public function __construct(
        private readonly DiscountCardIssueService $issuer,
    ) {}

    public function indexBatches(Request $request): JsonResponse
    {
        $batches = DiscountCardBatch::query()
            ->with('creator:id,name')
            ->orderByDesc('id')
            ->paginate(30);

        $items = collect($batches->items())->map(function (DiscountCardBatch $batch) {
            $cards = $batch->cardsQuery()->get(['id', 'is_active', 'redemptions_count', 'max_uses', 'deleted_at', 'expires_at']);
            $active = $cards->filter(fn (Promotion $p) => $p->deleted_at === null && $p->is_active)->count();
            $redeemed = $cards->sum(fn (Promotion $p) => (int) $p->redemptions_count);
            $voided = $cards->filter(fn (Promotion $p) => $p->deleted_at !== null || ! $p->is_active)->count();

            return [
                'id' => $batch->id,
                'name' => $batch->name,
                'type' => $batch->type,
                'discount_value' => $batch->discount_value,
                'min_order_laar' => $batch->min_order_laar,
                'starts_at' => $batch->starts_at?->toIso8601String(),
                'expires_at' => $batch->expires_at?->toIso8601String(),
                'max_uses_per_card' => $batch->max_uses_per_card,
                'max_uses_per_customer' => $batch->max_uses_per_customer,
                'quantity' => $batch->quantity,
                'note' => $batch->note,
                'created_by' => $batch->creator?->only(['id', 'name']),
                'created_at' => $batch->created_at?->toIso8601String(),
                'stats' => [
                    'active' => $active,
                    'redeemed_uses' => $redeemed,
                    'voided' => $voided,
                ],
            ];
        });

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $batches->currentPage(),
                'last_page' => $batches->lastPage(),
                'total' => $batches->total(),
            ],
        ]);
    }

    public function showBatch(int $id): JsonResponse
    {
        $batch = DiscountCardBatch::query()->with('creator:id,name')->findOrFail($id);
        $cards = $batch->cardsQuery()->get();

        return response()->json([
            'batch' => [
                'id' => $batch->id,
                'name' => $batch->name,
                'type' => $batch->type,
                'discount_value' => $batch->discount_value,
                'min_order_laar' => $batch->min_order_laar,
                'starts_at' => $batch->starts_at?->toIso8601String(),
                'expires_at' => $batch->expires_at?->toIso8601String(),
                'max_uses_per_card' => $batch->max_uses_per_card,
                'max_uses_per_customer' => $batch->max_uses_per_customer,
                'quantity' => $batch->quantity,
                'note' => $batch->note,
                'created_by' => $batch->creator?->only(['id', 'name']),
                'created_at' => $batch->created_at?->toIso8601String(),
            ],
            'cards' => $cards->map(fn (Promotion $p) => $this->formatCard($p))->values(),
        ]);
    }

    public function issue(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', 'in:percentage,fixed'],
            'discount_value' => ['required', 'integer', 'min:1', 'max:500000'],
            'min_order_laar' => ['sometimes', 'integer', 'min:0'],
            'starts_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date'],
            'max_uses_per_card' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'max_uses_per_customer' => ['nullable', 'integer', 'min:1', 'max:100'],
            'quantity' => ['required', 'integer', 'min:1', 'max:'.DiscountCardIssueService::MAX_QUANTITY],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        /** @var User $user */
        $user = $request->user();

        try {
            $result = $this->issuer->issue($user, $validated);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $batch = $result['batch'];

        return response()->json([
            'batch' => [
                'id' => $batch->id,
                'name' => $batch->name,
                'type' => $batch->type,
                'discount_value' => $batch->discount_value,
                'quantity' => $batch->quantity,
                'expires_at' => $batch->expires_at?->toIso8601String(),
            ],
            'cards' => $result['cards'],
            'message' => 'Discount cards issued. Copy or print the codes now.',
        ], 201);
    }

    public function voidCard(int $id): JsonResponse
    {
        $promo = Promotion::query()->findOrFail($id);

        try {
            $this->issuer->voidCard($promo);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Discount card voided.']);
    }

    /** @return array<string, mixed> */
    private function formatCard(Promotion $p): array
    {
        $exhausted = $p->max_uses !== null && $p->redemptions_count >= $p->max_uses;
        $expired = $p->expires_at && $p->expires_at->isPast();
        $voided = $p->deleted_at !== null || ! $p->is_active;

        $status = 'active';
        if ($voided) {
            $status = 'voided';
        } elseif ($expired) {
            $status = 'expired';
        } elseif ($exhausted) {
            $status = 'redeemed';
        }

        return [
            'id' => $p->id,
            'code' => $p->code,
            'name' => $p->name,
            'type' => $p->type,
            'discount_value' => $p->discount_value,
            'redemptions_count' => (int) $p->redemptions_count,
            'max_uses' => $p->max_uses,
            'starts_at' => $p->starts_at?->toIso8601String(),
            'expires_at' => $p->expires_at?->toIso8601String(),
            'is_active' => (bool) $p->is_active && $p->deleted_at === null,
            'status' => $status,
        ];
    }
}
