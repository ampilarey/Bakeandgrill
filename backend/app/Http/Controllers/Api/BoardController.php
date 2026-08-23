<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Order;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
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
 *   - An **owner issues it**, from the admin. There is no self-service pairing
 *     endpoint an attacker could drive, and no PIN on the screen to shoulder-surf.
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

        $token = $user->createToken(
            'board-' . preg_replace('/[^A-Za-z0-9 _-]/', '', $data['name']),
            [self::ABILITY],
            now()->addDays((int) config('sanctum.board_token_ttl_days')),
        );

        return response()->json([
            'message' => 'Board token created. Copy it now — it is not shown again.',
            'id' => $token->accessToken->id,
            'name' => $token->accessToken->name,
            'expires_at' => $token->accessToken->expires_at?->toIso8601String(),
            'token' => $token->plainTextToken,
        ], 201);
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
