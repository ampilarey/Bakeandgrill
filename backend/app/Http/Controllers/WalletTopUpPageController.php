<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Deposits\Services\WalletTopUpService;
use App\Domains\Deposits\Support\WalletTopUpRules;
use App\Models\WalletTopUp;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * The public top-up page, /wallet/top-up/{token} (owner, 2026-10-21): what a
 * staff-sent link opens, and the receipt of a top-up once paid. Token-gated
 * like the invoice page; the bank brings the customer back here. Asks the
 * bank first when a payment is still in flight, so a paid top-up never
 * shows as pending.
 */
class WalletTopUpPageController extends Controller
{
    public function __construct(private readonly WalletTopUpService $topUps) {}

    public function show(Request $request, string $token)
    {
        $topUp = $this->load($token);

        return response()
            ->view('wallet.topup', [
                'topUp' => $topUp,
                'customer' => $topUp->customer,
                'payment' => $request->query('payment'),
                'presetsMvr' => array_map(fn (int $l) => $l / 100, WalletTopUpRules::presetsLaar()),
                'minMvr' => WalletTopUpRules::minLaar() / 100,
                'maxMvr' => WalletTopUpRules::maxLaar() > 0 ? WalletTopUpRules::maxLaar() / 100 : null,
            ])
            ->header('Cache-Control', 'private, no-store');
    }

    /** POST /wallet/top-up/{token}/pay: start the card payment and send them to the bank. */
    public function pay(Request $request, string $token)
    {
        $topUp = $this->load($token);
        $custom = trim((string) $request->input('custom_mvr', ''));
        $raw = $custom !== '' ? $custom : trim((string) $request->input('amount_mvr', ''));
        $amountLaar = $raw !== '' && is_numeric($raw) ? (int) round(((float) $raw) * 100) : null;

        try {
            $url = $this->topUps->pay($topUp, $amountLaar);
        } catch (HttpException $e) {
            return redirect()->route('wallet-topup.show', $token)->with('error', $e->getMessage() ?: 'Online payment is not available right now. Please try again shortly.');
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('wallet top-up page: gateway unavailable', ['top_up_id' => $topUp->id, 'error' => $e->getMessage()]);

            return redirect()->route('wallet-topup.show', $token)->with('error', 'Online payment is not available right now. Please try again shortly.');
        }

        return redirect()->away($url);
    }

    private function load(string $token): WalletTopUp
    {
        $topUp = WalletTopUp::query()->with(['customer', 'ledger'])->where('token', $token)->firstOrFail();
        if ($topUp->status === WalletTopUp::STATUS_PENDING) {
            $this->topUps->heal($topUp);
            $topUp = $this->topUps->expireIfDue($topUp->fresh());
            $topUp->load(['customer', 'ledger']);
        }

        return $topUp;
    }
}
