<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Item;
use App\Models\PreOrder;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PreOrderController extends Controller
{
    public function create()
    {
        // Require login for event orders
        if (!session('customer_id')) {
            session(['intended_url' => '/pre-order']);

            return redirect('/customer/login')->with('message', 'Please login to place event orders');
        }

        $items = Item::where('is_active', true)
            ->with('category')
            ->orderBy('name')
            ->get();

        return view('pre-order.create', compact('items'));
    }

    public function store(Request $request)
    {
        // Require login
        if (!session('customer_id')) {
            return redirect('/customer/login');
        }

        $request->validate([
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string',
            'customer_email' => 'nullable|email',
            'fulfillment_date' => 'required|date|after:now',
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|exists:items,id',
            'items.*.quantity' => 'required|integer|min:1',
            'customer_notes' => 'nullable|string|max:1000',
        ]);

        // Calculate totals using the same integer-laari math the main Order
        // path uses (via OrderTotalsCalculator) so a pre-order that becomes
        // a real order doesn't change price on the customer because tax
        // suddenly gets added. We don't instantiate the full calculator
        // here (it operates on Order rows + DiscountsInput), but we mirror
        // its rounding: floor for discount components, round-half-up for
        // tax, integer laari throughout, and per-item tax_rate snapshotting.
        $itemsData = [];
        $subtotalLaar = 0;
        $taxLaar = 0;

        $globalTaxBp = (int) config('app.tax_rate_bp', 0); // 0 = no fallback tax
        $taxInclusive = (bool) config('app.tax_inclusive', false);

        foreach ($request->items as $itemData) {
            $item = Item::find($itemData['item_id']);
            if (!$item) {
                continue;
            }

            $qty = (int) $itemData['quantity'];
            $unitPriceLaar = (int) round((float) $item->base_price * 100);
            $lineLaar = $unitPriceLaar * $qty;
            $itemTaxBp = (int) ($item->tax_rate_bp ?? $globalTaxBp);

            // Per-item tax: inclusive prices have tax extracted from
            // base_price; exclusive prices have tax added on top.
            if ($itemTaxBp > 0) {
                if ($taxInclusive) {
                    $itemTaxLaar = (int) round($lineLaar * $itemTaxBp / (10000 + $itemTaxBp));
                } else {
                    $itemTaxLaar = (int) round($lineLaar * $itemTaxBp / 10000);
                }
            } else {
                $itemTaxLaar = 0;
            }

            $subtotalLaar += $lineLaar;
            $taxLaar += $itemTaxLaar;

            $itemsData[] = [
                'item_id' => $item->id,
                'name' => $item->name,
                'quantity' => $qty,
                'price' => $item->base_price,
                'total' => $lineLaar / 100,
                'tax_rate_bp' => $itemTaxBp,
                'tax' => $itemTaxLaar / 100,
            ];
        }

        $totalLaar = $taxInclusive ? $subtotalLaar : $subtotalLaar + $taxLaar;

        $preOrder = PreOrder::create([
            'order_number' => 'PRE-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6)),
            'customer_id' => session('customer_id'),
            'customer_name' => $request->customer_name,
            'customer_phone' => $request->customer_phone,
            'customer_email' => $request->customer_email,
            'fulfillment_date' => $request->fulfillment_date,
            'items' => $itemsData,
            'subtotal' => $subtotalLaar / 100,
            'tax_amount' => $taxLaar / 100,
            'total' => $totalLaar / 100,
            'status' => 'pending',
            'customer_notes' => $request->customer_notes,
        ]);

        return redirect()->route('pre-order.confirmation', $preOrder->id)
            ->with('success', 'Pre-order submitted! Awaiting confirmation.');
    }

    public function confirmation($id)
    {
        $preOrder = PreOrder::findOrFail($id);

        return view('pre-order.confirmation', compact('preOrder'));
    }
}
