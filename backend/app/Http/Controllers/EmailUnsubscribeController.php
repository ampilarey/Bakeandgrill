<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Stop promotional messages from the link in a promotional email (owner,
 * 2026-10-06). The signed URL names the customer; it sets the same opt-out
 * as the SMS preferences page, so promotional texts and their email copies
 * both stop. Order, payment and sign-in messages are unaffected.
 *
 * GET shows a confirm button (link checkers open links without meaning to);
 * POST applies it, including the one-click unsubscribe mail apps send.
 */
class EmailUnsubscribeController extends Controller
{
    public function show(Request $request, Customer $customer)
    {
        return view('email-unsubscribe', [
            'done' => (bool) $customer->sms_opt_out,
            'action' => $request->fullUrl(),
        ]);
    }

    public function store(Request $request, Customer $customer)
    {
        if (!$customer->sms_opt_out) {
            $customer->forceFill(['sms_opt_out' => true, 'sms_opt_out_at' => now(), 'sms_opt_out_source' => 'email_link'])->save();
            Log::info('promotions: opt-out from an email link', ['customer_id' => $customer->id]);
        }

        if ($request->input('List-Unsubscribe') === 'One-Click') {
            return response()->noContent();
        }

        return view('email-unsubscribe', ['done' => true, 'action' => $request->fullUrl()]);
    }
}
