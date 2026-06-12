<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Gst\Services\GstTaxCalculator;
use App\Models\Item;
use App\Models\PreOrder;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PreOrderController extends Controller
{
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

        $settings = app(GstSettingsService::class);
        $calculator = app(GstTaxCalculator::class);
        $globalTaxBp = $settings->defaultTaxRateBp();
        $taxInclusive = $settings->taxInclusive();

        foreach ($request->items as $itemData) {
            $item = Item::find($itemData['item_id']);
            if (!$item) {
                continue;
            }

            $qty = (int) $itemData['quantity'];
            $unitPriceLaar = (int) round((float) $item->base_price * 100);
            $lineLaar = $unitPriceLaar * $qty;
            $itemTaxBp = $calculator->resolveTaxRateBp($item->tax_code ?? null);

            if ($itemTaxBp > 0) {
                $itemTaxLaar = $calculator->calculateLineTaxLaar($lineLaar, $item->tax_code ?? null, $taxInclusive);
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
