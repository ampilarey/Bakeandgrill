<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Promotion;
use App\Models\Receipt;
use App\Models\Variant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * One answer for anything the till scans.
 *
 * Owner, 2026-09-02: a scanner gun, the iPad camera, or the search box can
 * all hand the till a code, and the till should not have to guess what it
 * is. This says: an item (with the size, when the size has its own code),
 * a gift card, a promotion or discount card, or a customer — or nothing.
 *
 * Gift cards are only recognised by their shape: the till checks the balance
 * itself, which is what proves the card. Nothing about the card is revealed
 * here.
 */
class PosScanController extends Controller
{
    public const GIFT_CARD_PATTERN = '/\bGC-\d{6,8}-\d{4}\b/i';

    /** "BG-C-7771234", "BG-CUST:7771234", or a bare local number after every other match fails. */
    private const CUSTOMER_PATTERN = '/^BG-?C(?:UST)?[:\-](\d{7,15})$/i';

    /** GET /pos/scan?code=… — a query parameter, since a QR can hold a URL with slashes in it. */
    public function resolve(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $raw = trim((string) $request->query('code', ''));
        if ($raw === '' || mb_strlen($raw) > 200) {
            return response()->json(['kind' => 'unknown', 'code' => $raw]);
        }

        // The QR printed on a receipt: bring that order back up.
        if (preg_match('#/receipts/([A-Za-z0-9]{40,64})(?:[/?\#]|$)#', $raw, $m) || preg_match('/^[A-Za-z0-9]{48}$/', $raw, $m)) {
            $receipt = Receipt::query()->where('token', $m[1] ?? $m[0])->with('order:id,order_number')->first();
            if ($receipt?->order) {
                return response()->json([
                    'kind' => 'receipt',
                    'order_id' => (int) $receipt->order_id,
                    'order_number' => (string) $receipt->order->order_number,
                ]);
            }
        }

        // A QR on a card may carry a link with the code in it.
        if (preg_match(self::GIFT_CARD_PATTERN, $raw, $m)) {
            return response()->json(['kind' => 'gift_card', 'code' => strtoupper($m[0])]);
        }

        if ($item = $this->item($raw)) {
            return response()->json(['kind' => 'item'] + $item);
        }

        if (preg_match(self::CUSTOMER_PATTERN, $raw, $m)) {
            return $this->customer($m[1], $raw);
        }

        $promotion = Promotion::query()->where('code', strtoupper($raw))->first();
        if ($promotion) {
            return response()->json([
                'kind' => 'promotion',
                'code' => (string) $promotion->code,
                'name' => (string) $promotion->name,
                'valid' => $promotion->isValid(),
            ]);
        }

        // A bare phone number, only once nothing else has claimed it: an
        // item barcode would have matched above.
        if (preg_match('/^\d{7}$/', $raw)) {
            return $this->customer($raw, $raw);
        }

        return response()->json(['kind' => 'unknown', 'code' => $raw]);
    }

    /** @return array<string, mixed>|null */
    private function item(string $code): ?array
    {
        $lookup = $code;
        $weightGrams = null;
        // GS1-128 weight barcode, as ItemController::lookupByBarcode reads it.
        if (preg_match('/^2(\d{5})(\d{5})\d$/', $code, $m)) {
            $lookup = $m[1];
            $weightGrams = (int) $m[2];
        }

        $with = ['category', 'variants', 'modifiers', 'packagingOptions'];
        $item = Item::with($with)
            ->where(fn ($q) => $q->where('barcode', $lookup)->orWhere('sku', $lookup))
            ->where('is_active', true)
            ->where('is_available', true)
            ->first();
        $variant = null;

        if (!$item) {
            $variant = Variant::query()
                ->where(fn ($q) => $q->where('barcode', $lookup)->orWhere('sku', $lookup))
                ->where('is_active', true)
                ->first();
            if ($variant) {
                $item = Item::with($with)
                    ->whereKey($variant->item_id)
                    ->where('is_active', true)
                    ->where('is_available', true)
                    ->first();
            }
        }

        if (!$item) {
            return null;
        }

        return [
            'item' => $item,
            'variant' => $variant,
            'weight_grams' => $weightGrams,
        ];
    }

    private function customer(string $phone, string $raw): JsonResponse
    {
        $customer = Customer::query()
            ->where('phone', $phone)
            ->orWhere('phone', 'like', '%' . $phone)
            ->select(['id', 'name', 'phone', 'email', 'loyalty_points', 'tier', 'sms_opt_out', 'last_order_at', 'created_at'])
            ->first();

        if (!$customer) {
            return response()->json(['kind' => 'unknown', 'code' => $raw]);
        }

        return response()->json(['kind' => 'customer', 'customer' => $customer]);
    }
}
