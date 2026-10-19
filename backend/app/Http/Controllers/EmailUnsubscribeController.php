<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Stop promotional email from the link in a promotional email.
 * The signed URL names the customer. It turns off offer emails only.
 * A second button also turns off offer SMS. Order, payment and sign-in
 * messages are unaffected either way.
 *
 * GET shows a confirm button (link checkers open links without meaning to);
 * POST applies it, including the one-click unsubscribe mail apps send.
 */
class EmailUnsubscribeController extends Controller
{
    public function show(Request $request, Customer $customer)
    {
        $choices = \App\Domains\Customers\Support\MessageChoices::for($customer);

        return view('email-unsubscribe', [
            'done' => !$choices['offers']['email'] && !$choices['offers']['sms'],
            'emailStopped' => !$choices['offers']['email'],
            'action' => $request->fullUrl(),
        ]);
    }

    public function store(Request $request, Customer $customer)
    {
        $alsoSms = $request->boolean('also_sms');
        \App\Domains\Customers\Support\MessageChoices::stopOffers($customer, 'email_link', $alsoSms);
        Log::info('promotions: opt-out from an email link', [
            'customer_id' => $customer->id,
            'also_sms' => $alsoSms,
        ]);

        if ($request->input('List-Unsubscribe') === 'One-Click') {
            return response()->noContent();
        }

        return view('email-unsubscribe', [
            'done' => $alsoSms,
            'emailStopped' => true,
            'action' => $request->fullUrl(),
        ]);
    }
}
