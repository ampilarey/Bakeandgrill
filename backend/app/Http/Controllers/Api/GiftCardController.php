<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GiftCardController extends Controller
{
    // ── Public: check balance ─────────────────────────────────────────────────

    public function balance(string $code): JsonResponse
    {
        $card = GiftCard::where('code', strtoupper($code))->first();

        // Return a generic 404 for both not-found and non-active cards to prevent
        // enumeration attacks that could reveal card status from error messages.
        if (!$card || $card->status !== 'active') {
            return response()->json(['error' => 'Invalid or unavailable gift card.'], 404);
        }

        if ($card->expires_at && $card->expires_at->isPast()) {
            $card->update(['status' => 'expired']);

            return response()->json(['error' => 'Invalid or unavailable gift card.'], 404);
        }

        return response()->json([
            'code'            => $card->code,
            'current_balance' => (float) $card->current_balance,
            'expires_at'      => $card->expires_at?->toDateString(),
        ]);
    }

    // ── Admin: issue a gift card ──────────────────────────────────────────────

    public function issue(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount'     => ['required', 'numeric', 'min:1'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'expires_at' => ['nullable', 'date'],
        ]);

        $code = null;
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $candidate = strtoupper(Str::random(4) . '-' . Str::random(4) . '-' . Str::random(4));
            if (!GiftCard::where('code', $candidate)->exists()) {
                $code = $candidate;
                break;
            }
        }
        if ($code === null) {
            return response()->json(['message' => 'Could not generate a unique gift card code. Please try again.'], 500);
        }

        $card = GiftCard::create([
            'code'                     => $code,
            'initial_balance'          => $validated['amount'],
            'current_balance'          => $validated['amount'],
            'issued_to_customer_id'    => $validated['customer_id'] ?? null,
            'purchased_by_customer_id' => null,
            'status'                   => 'active',
            'expires_at'               => $validated['expires_at'] ?? null,
        ]);

        GiftCardTransaction::create([
            'gift_card_id' => $card->id,
            'amount'       => $validated['amount'],
            'type'         => 'load',
            'balance_after'=> $validated['amount'],
        ]);

        return response()->json(['gift_card' => $this->format($card)], 201);
    }

    // ── Admin: list gift cards ────────────────────────────────────────────────

    public function index(): JsonResponse
    {
        $cards = GiftCard::with('issuedTo:id,name,phone')
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json([
            'data' => collect($cards->items())->map(fn($c) => $this->format($c)),
            'meta' => ['current_page' => $cards->currentPage(), 'last_page' => $cards->lastPage(), 'total' => $cards->total()],
        ]);
    }

    private function format(GiftCard $c): array
    {
        return [
            'id'              => $c->id,
            'code'            => $c->code,
            'initial_balance' => (float) $c->initial_balance,
            'current_balance' => (float) $c->current_balance,
            'status'          => $c->status,
            'expires_at'      => $c->expires_at?->toDateString(),
            'issued_to'       => $c->issuedTo ? ['id' => $c->issuedTo->id, 'name' => $c->issuedTo->name] : null,
        ];
    }
}
