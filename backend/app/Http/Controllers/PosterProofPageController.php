<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Posters\PosterOrders;
use App\Models\PosterOrder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Illuminate\View\View;

/** The phone page a signed link opens (docs/POSTER_PLAN.md § 9). */
class PosterProofPageController extends Controller
{
    public function show(Request $request, PosterOrder $order): View
    {
        abort_unless($request->hasValidSignature(), 403);
        $order->load('poster', 'shop');

        return view('posters.proof', [
            'order' => $order,
            'code' => $order->poster?->code() ?? ('P' . $order->id),
            'approveUrl' => URL::temporarySignedRoute('posters.proof.approve', now()->addDay(), ['order' => $order->id]),
        ]);
    }

    public function approve(Request $request, PosterOrder $order): View
    {
        abort_unless($request->hasValidSignature(), 403);
        PosterOrders::approveProof($order);
        $order->refresh()->load('poster', 'shop');

        return view('posters.proof', [
            'order' => $order,
            'code' => $order->poster?->code() ?? ('P' . $order->id),
            'approveUrl' => '',
        ]);
    }
}
