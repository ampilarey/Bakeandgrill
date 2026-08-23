<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\BoardPairing;
use App\Models\Order;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Laravel\Sanctum\NewAccessToken;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Wall-mounted order boards — the screens in the kitchen and behind the till.
 *
 * These are unattended, so they cannot use the PIN login the POS and KDS use:
 * a 72-hour staff token means the board goes blank on a Sunday morning and
 * nobody notices until an online order is missed. They get their own
 * credential instead.
 *
 * The shape of that credential is the security decision here, and it is
 * deliberately narrow, because a board displays customer names and phone
 * numbers on a screen in a room:
 *
 *   - **Only an owner creates one.** There are two ways in — issuing a key
 *     directly, and approving the six characters a screen is showing — and
 *     both run through mintToken() behind the same permission. The pairing
 *     handshake itself is public, because a television with no credential is
 *     the problem being solved, but starting one grants nothing: it returns a
 *     code that stays worthless until somebody authorised types it.
 *   - It carries the single ability `board`, and the only route that accepts
 *     that ability is the read below. A stolen board token cannot ring a sale,
 *     take a payment, or change an order.
 *   - It is shown **once**, at issue. We store the hash, like every other
 *     Sanctum token.
 *   - Revoking is deleting the row; the screen goes to its pairing message on
 *     the next poll rather than serving stale customer data.
 *
 * The long TTL (a year by default, see config/sanctum.board_token_ttl_days) is
 * safe only because of the three points above. Shorten it where a screen is
 * somewhere the public can reach.
 */
class BoardController extends Controller
{
    /** Only ever this one. Widening it widens what a wall screen can do. */
    private const ABILITY = 'board';

    /**
     * Issue a board token. Owner action, shown once.
     */
    public function issueToken(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
        ]);

        $user = $request->user();
        if (!$user instanceof User) {
            return response()->json(['message' => 'Forbidden — staff access only.'], 403);
        }

        $token = $this->mintToken($user, $data['name']);

        return response()->json([
            'message' => 'Board token created. Copy it now — it is not shown again.',
            'id' => $token->accessToken->id,
            'name' => $token->accessToken->name,
            'expires_at' => $token->accessToken->expires_at?->toIso8601String(),
            'token' => $token->plainTextToken,
        ], 201);
    }

    /** The one place a board key is created. */
    private function mintToken(User $user, string $name): NewAccessToken
    {
        return $user->createToken(
            'board-' . preg_replace('/[^A-Za-z0-9 _-]/', '', $name),
            [self::ABILITY],
            now()->addDays((int) config('sanctum.board_token_ttl_days')),
        );
    }

    // ── Pairing a screen that has no keyboard ─────────────────────────────
    //
    // A television cannot have a 50-character key typed into it, so the screen
    // shows six characters instead and the owner types those on their phone.
    // The screen then collects its own key. This happens once per screen: the
    // key is kept in the television's own storage and lasts a year.

    /**
     * A screen asks to be paired. Public — an unpaired screen has no
     * credential yet, which is the entire problem being solved.
     *
     * Handing out a code costs nothing and grants nothing: the code is useless
     * until an owner approves it, and useless to anyone but the browser
     * holding the matching poll token.
     */
    public function startPairing(Request $request): JsonResponse
    {
        ['pairing' => $pairing, 'poll_token' => $pollToken] = BoardPairing::start();

        return response()->json([
            'code' => $pairing->code,
            // Never displayed on the screen. This is what proves, on the next
            // poll, that we are the browser that asked — so photographing the
            // code off a television is not enough to collect the key.
            'poll_token' => $pollToken,
            'expires_at' => $pairing->expires_at?->toIso8601String(),
            'expires_in' => self::pairingTtlSeconds(),
        ], 201);
    }

    /**
     * The screen asks whether it has been approved yet, and collects its key
     * exactly once when it has.
     */
    public function pairingStatus(Request $request): JsonResponse
    {
        $data = $request->validate([
            'poll_token' => ['required', 'string', 'max:64'],
        ]);

        BoardPairing::purgeExpired();

        $pairing = BoardPairing::query()
            ->live()
            ->where('poll_token_hash', hash('sha256', $data['poll_token']))
            ->first();

        // Also covers "approved and already collected": the row is gone.
        if (!$pairing || !$pairing->pollTokenMatches($data['poll_token'])) {
            return response()->json(['status' => 'expired'], 404);
        }

        if (!$pairing->isApproved()) {
            return response()->json([
                'status' => 'waiting',
                'code' => $pairing->code,
                'expires_at' => $pairing->expires_at?->toIso8601String(),
            ]);
        }

        $token = $pairing->board_token;
        // Delivered once. Even if the screen retries, the key is no longer
        // sitting in a database row waiting to be read a second time.
        $pairing->delete();

        return response()->json([
            'status' => 'approved',
            'name' => $pairing->displayName(),
            'token' => $token,
        ]);
    }

    /**
     * An owner types the six characters from the screen. This is the moment
     * the key is created — nothing exists before somebody authorised says so.
     */
    public function claimPairing(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:12'],
            'name' => ['required', 'string', 'max:60'],
        ]);

        $user = $request->user();
        if (!$user instanceof User) {
            return response()->json(['message' => 'Forbidden — staff access only.'], 403);
        }

        BoardPairing::purgeExpired();

        $pairing = BoardPairing::query()
            ->live()
            // Typed off a screen, so accept whatever case and spacing the
            // owner's phone produced.
            ->where('code', strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $data['code']) ?? ''))
            ->first();

        if (!$pairing) {
            return response()->json([
                'message' => 'No screen is showing that code. Check the screen — codes expire after '
                    . BoardPairing::TTL_MINUTES . ' minutes.',
            ], 404);
        }

        if ($pairing->isApproved()) {
            return response()->json(['message' => 'That screen has already been paired.'], 409);
        }

        $token = $this->mintToken($user, $data['name']);

        $pairing->update([
            'name' => $data['name'],
            'board_token' => $token->plainTextToken,
            'personal_access_token_id' => $token->accessToken->id,
            'approved_by' => $user->id,
            'approved_at' => now(),
        ]);

        return response()->json([
            'message' => 'Screen paired. It starts showing orders within a few seconds.',
            'id' => $token->accessToken->id,
            'name' => $token->accessToken->name,
        ], 201);
    }

    private static function pairingTtlSeconds(): int
    {
        return BoardPairing::TTL_MINUTES * 60;
    }

    /**
     * The boards currently issued, so an owner can see and revoke them.
     */
    public function listTokens(Request $request): JsonResponse
    {
        $rows = PersonalAccessToken::query()
            ->where('name', 'like', 'board-%')
            ->orderByDesc('id')
            ->get(['id', 'name', 'last_used_at', 'expires_at', 'created_at']);

        return response()->json([
            'boards' => $rows->map(fn (PersonalAccessToken $t) => [
                'id' => $t->id,
                'name' => $t->name,
                'last_used_at' => $t->last_used_at?->toIso8601String(),
                'expires_at' => $t->expires_at?->toIso8601String(),
                'created_at' => $t->created_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    public function revokeToken(Request $request, int $id): JsonResponse
    {
        $token = PersonalAccessToken::query()
            ->where('id', $id)
            // Scoped to board tokens on purpose: this endpoint must never
            // become a way to revoke a cashier's or an owner's session.
            ->where('name', 'like', 'board-%')
            ->first();

        if (!$token) {
            return response()->json(['message' => 'Board not found.'], 404);
        }

        $token->delete();

        return response()->json(['message' => 'Board revoked.']);
    }

    /**
     * Everything currently in flight, for display.
     *
     * Read-only and deliberately thin: order number, where it came from, what
     * stage it is at, how long it has been waiting, and enough of the items to
     * recognise it across a room. No money, no payment state, no address.
     */
    public function orders(Request $request): JsonResponse
    {
        $orders = Order::query()
            ->with([
                'items:id,order_id,item_name,quantity',
                'table:id,name',
                'user:id,name',
            ])
            ->whereIn('status', ['pending', 'confirmed', 'preparing', 'ready'])
            ->where('type', '!=', 'gift_card')
            // Same hold as the KDS: nothing shows before staff fire it.
            ->where(function ($q) {
                $q->whereNull('fulfil_date')->orWhereNotNull('fired_at');
            })
            ->orderBy('created_at')
            ->limit(60)
            ->get();

        return response()->json([
            'generated_at' => now()->toIso8601String(),
            'orders' => $orders->map(function (Order $order) {
                return [
                    'id' => $order->id,
                    'order_number' => $order->order_number,
                    'status' => $order->status,
                    'type' => $order->type,
                    'is_customer_placed' => $order->isCustomerPlaced(),
                    'placed_by' => $order->user?->name,
                    'table' => $order->table?->name,
                    'created_at' => $order->created_at?->toIso8601String(),
                    // A count, not a total: a wall screen is not a receipt.
                    'item_count' => (int) $order->items->sum('quantity'),
                    'items' => $order->items->take(6)->map(fn ($i) => [
                        'name' => $i->item_name,
                        'quantity' => (int) $i->quantity,
                    ])->values(),
                ];
            })->values(),
        ]);
    }
}
