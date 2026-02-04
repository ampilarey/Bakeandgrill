<?php

namespace App\Http\Controllers;

use App\Models\PreOrder;
use App\Models\Item;
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

        // Calculate totals
        $itemsData = [];
        $subtotal = 0;

        foreach ($request->items as $itemData) {
            $item = Item::find($itemData['item_id']);
            if (!$item) continue;

            $lineTotal = $item->base_price * $itemData['quantity'];
            $subtotal += $lineTotal;

            $itemsData[] = [
                'item_id' => $item->id,
                'name' => $item->name,
                'quantity' => $itemData['quantity'],
                'price' => $item->base_price,
                'total' => $lineTotal,
            ];
        }

        // Create pre-order
        $preOrder = PreOrder::create([
            'order_number' => 'PRE-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6)),
            'customer_id' => session('customer_id'),
            'customer_name' => $request->customer_name,
            'customer_phone' => $request->customer_phone,
            'customer_email' => $request->customer_email,
            'fulfillment_date' => $request->fulfillment_date,
            'items' => $itemsData,
            'subtotal' => $subtotal,
            'total' => $subtotal,
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
