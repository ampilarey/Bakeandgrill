<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Rules\MaldivesPhone;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\View\View;

/**
 * The unsubscribe page (SMS audit, 2026-09-24). The privacy page said
 * "reply STOP" while nothing read replies, and the opt-out API had no
 * page. This is the page: one number, one button, and the answer is the
 * same whether the number is known or not, so it cannot be used to check
 * who is a customer. Opting back in happens from the signed-in order app
 * or by asking staff, so a stranger cannot re-subscribe someone.
 */
class SmsPreferencesPageController extends Controller
{
    public function show(Request $request): View
    {
        return view('sms-preferences', [
            'phone' => mb_substr(trim((string) $request->query('phone', '')), 0, 20),
            'done' => (string) $request->session()->get('sms_pref', ''),
        ]);
    }

    public function optOut(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20', new MaldivesPhone],
        ]);
        $phone = MaldivesPhone::normalize($data['phone']);

        $changed = Customer::query()
            ->where('phone', $phone)
            ->where('sms_opt_out', false)
            ->update(['sms_opt_out' => true, 'sms_opt_out_at' => now(), 'sms_opt_out_source' => 'web_form']);
        Log::info('sms: opt-out from the website form', ['phone_tail' => substr($phone, -4), 'changed' => $changed]);

        return redirect()->route('sms.preferences')->with('sms_pref', 'done');
    }
}
