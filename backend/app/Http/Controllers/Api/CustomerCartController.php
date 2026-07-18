<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Marketing\Services\MarketingAutomationService;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Rules\MaldivesPhone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CustomerCartController extends Controller
{
    public function snapshot(Request $request, MarketingAutomationService $marketing): JsonResponse
    {
        $customer = $request->user();
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $validated = $request->validate([
            'items' => 'required|array|min:1|max:50',
            'items.*.id' => 'required|integer',
            'items.*.name' => 'required|string|max:255',
            'items.*.quantity' => 'required|integer|min:1|max:99',
            'items.*.price' => 'nullable|numeric|min:0',
            'subtotal_laar' => 'nullable|integer|min:0',
        ]);

        [$items, $subtotalLaar] = $this->normalizeItems($validated);

        $cart = $marketing->snapshotCart($customer, $items, $subtotalLaar);

        return response()->json([
            'cart_token' => $cart->cart_token,
            'snapshot_at' => $cart->snapshot_at?->toIso8601String(),
        ]);
    }

    /** Public/guest cart snapshot — phone required so recovery SMS has a destination. */
    public function snapshotGuest(Request $request, MarketingAutomationService $marketing): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:30', new MaldivesPhone],
            'items' => 'required|array|min:1|max:50',
            'items.*.id' => 'required|integer',
            'items.*.name' => 'required|string|max:255',
            'items.*.quantity' => 'required|integer|min:1|max:99',
            'items.*.price' => 'nullable|numeric|min:0',
            'subtotal_laar' => 'nullable|integer|min:0',
        ]);

        [$items, $subtotalLaar] = $this->normalizeItems($validated);

        try {
            $cart = $marketing->snapshotGuestCart((string) $validated['phone'], $items, $subtotalLaar);
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages(['phone' => [$e->getMessage()]]);
        }

        return response()->json([
            'cart_token' => $cart->cart_token,
            'snapshot_at' => $cart->snapshot_at?->toIso8601String(),
        ]);
    }

    /**
     * @param array<string, mixed> $validated
     * @return array{0: list<array<string, mixed>>, 1: int}
     */
    private function normalizeItems(array $validated): array
    {
        $items = array_map(fn (array $row) => [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'quantity' => (int) $row['quantity'],
            'price' => isset($row['price']) ? (float) $row['price'] : null,
        ], $validated['items']);

        $subtotalLaar = (int) ($validated['subtotal_laar'] ?? 0);
        if ($subtotalLaar <= 0) {
            $subtotalLaar = (int) round(array_reduce(
                $items,
                fn (float $sum, array $it) => $sum + (($it['price'] ?? 0) * $it['quantity']),
                0.0,
            ) * 100);
        }

        return [$items, $subtotalLaar];
    }
}
