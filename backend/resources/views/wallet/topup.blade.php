@extends('layouts.document')

@php
    /** @var \App\Models\WalletTopUp $topUp */
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
    $tz = config('app.timezone', 'Indian/Maldives');
    $status = (string) $topUp->status;
    $open = $topUp->isOpen();
    $paid = $status === \App\Models\WalletTopUp::STATUS_PAID;
    $badge = match ($status) {
        'paid' => 'Paid',
        'expired' => 'Expired',
        'cancelled' => 'Cancelled',
        default => 'Awaiting payment',
    };
    $badgeClass = match ($status) {
        'paid' => 'doc-badge--paid',
        'expired', 'cancelled' => 'doc-badge--draft',
        default => 'doc-badge--unpaid',
    };
    $amountMvr = $topUp->amount_laar !== null ? number_format($topUp->amount_laar / 100, 2) : null;
    // An open link's customer picks the amount, and may change it until paid.
    $picks = !$topUp->amount_fixed;
    $pickedMvr = $topUp->amount_laar !== null ? $topUp->amount_laar / 100 : null;
    $pickedIsPreset = $pickedMvr !== null && in_array($pickedMvr, $presetsMvr, true);
    $digits = preg_replace('/\D+/', '', (string) ($customer?->phone ?? ''));
    $maskedPhone = strlen($digits) >= 4 ? str_repeat('•', max(0, strlen($digits) - 4)) . substr($digits, -4) : '';
    $firstName = trim((string) explode(' ', trim((string) ($customer?->name ?? '')))[0]);
    $balanceAfterMvr = $topUp->ledger !== null ? number_format(((int) $topUp->ledger->balance_after_laar) / 100, 2) : null;
    $reference = $topUp->payment?->provider_transaction_id;
    $appUrl = url('/order/account');
@endphp

@section('title', 'Wallet top-up ' . $topUp->number() . ' — ' . $siteName)

@push('head')
    <meta name="robots" content="noindex, nofollow">
    <style nonce="{{ csp_nonce() }}">
        .wt-amount { font-size: 2rem; font-weight: 800; color: var(--amber); margin: 0.25rem 0 0; letter-spacing: -0.02em; }
        .wt-choices { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0 0; }
        .wt-choices input { position: absolute; opacity: 0; width: 1px; height: 1px; overflow: hidden; }
        .wt-choices label {
            display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 1rem;
            border-radius: 999px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text);
            font-weight: 700; cursor: pointer; flex: 1 1 calc(50% - 0.25rem);
        }
        .wt-choices input:checked + label { border-color: var(--amber); background: var(--amber-light); color: var(--amber); }
        .wt-choices input:focus-visible + label { box-shadow: 0 0 0 4px var(--amber-glow); }
        .wt-custom { margin-top: 0.75rem; }
        .wt-custom label { display: block; font-size: 0.85rem; color: var(--muted); font-weight: 600; margin-bottom: 0.3rem; }
        .wt-custom input {
            width: 100%; min-height: 44px; padding: 0 0.9rem; border-radius: 12px; border: 1.5px solid var(--border);
            background: var(--surface); color: var(--text); font: inherit; font-size: 16px;
        }
        .wt-custom input:focus { outline: none; border-color: var(--amber); box-shadow: 0 0 0 4px var(--amber-glow); }
        .wt-note { font-size: 0.85rem; color: var(--muted); margin: 0.75rem 0 0; line-height: 1.5; }
        @media (min-width: 480px) { .wt-choices label { flex: 0 1 auto; min-width: 7rem; } }
    </style>
@endpush

@section('content')
<div class="doc-card" data-wallet-topup="{{ $status }}">
    @include('partials.document-masthead', [
        'docType' => 'Wallet top-up',
        'docNumber' => $topUp->number(),
        'docBadge' => $badge,
        'docBadgeClass' => $badgeClass,
    ])

    <div class="doc-card-body">
        @if (session('success'))
            <div class="doc-alert doc-alert--success">{{ session('success') }}</div>
        @endif
        @if (session('error'))
            <div class="doc-alert doc-alert--error">{{ session('error') }}</div>
        @endif

        @if (!$paid && $payment === 'CONFIRMED')
            <div class="doc-banner doc-banner--warn" data-topup-banner="confirming">Payment is being confirmed with the bank. Refresh in a moment.</div>
        @elseif (!$paid && $payment !== null && $payment !== '')
            <div class="doc-banner doc-banner--warn" data-topup-banner="not-completed">Payment was not completed. Nothing was added to the wallet. You can try again below.</div>
        @endif

        <div class="doc-meta-grid">
            <div>
                <p class="doc-eyebrow">Wallet of</p>
                <p style="font-weight:700; margin:0;">{{ $customer?->name ?: 'Customer' }}</p>
                @if ($maskedPhone !== '')
                    <p class="doc-subtitle" style="margin:0;">{{ $maskedPhone }}</p>
                @endif
            </div>
            <div>
                <p class="doc-eyebrow">Dates</p>
                <p style="margin:0;">Made: {{ optional($topUp->created_at)->timezone($tz)->format('d M Y, g:i A') }}</p>
                @if ($paid && $topUp->paid_at)
                    <p style="margin:0.25rem 0 0; color:var(--success-text); font-weight:600;">Paid: {{ $topUp->paid_at->timezone($tz)->format('d M Y, g:i A') }}</p>
                @elseif ($open && $topUp->expires_at)
                    <p style="margin:0.25rem 0 0; color:var(--muted);">Good until: {{ $topUp->expires_at->timezone($tz)->format('d M Y, g:i A') }}</p>
                @endif
            </div>
        </div>

        @if ($paid)
            <div class="doc-totals" data-topup-receipt>
                <p><span>Added to the wallet</span><span>MVR {{ $amountMvr }}</span></p>
                <p><span>Paid by</span><span>Card (BML)</span></p>
                @if ($reference)
                    <p><span>Reference</span><span>{{ $reference }}</span></p>
                @endif
                @if ($balanceAfterMvr !== null)
                    <p class="grand"><span>Wallet balance after</span><span>MVR {{ $balanceAfterMvr }}</span></p>
                @endif
            </div>
            <p class="wt-note">Thank you{{ $firstName !== '' ? ', ' . $firstName : '' }}. The money is in your wallet and can be spent at the counter or in the app.</p>
            <div class="doc-actions">
                <a class="doc-btn doc-btn-primary" href="{{ $appUrl }}">Open my wallet</a>
                <button type="button" class="doc-btn doc-btn-print">Print</button>
            </div>
        @elseif ($open)
            <form method="post" action="{{ route('wallet-topup.pay', $topUp->token) }}" data-topup-form>
                @if (!$picks)
                    <p class="doc-eyebrow" style="margin-top:1rem;">Amount</p>
                    <p class="wt-amount" data-topup-amount>MVR {{ $amountMvr }}</p>
                @else
                    <p class="doc-eyebrow" style="margin-top:1rem;">How much to add</p>
                    @if (count($presetsMvr) > 0)
                        <div class="wt-choices" role="radiogroup" aria-label="Amount">
                            @foreach ($presetsMvr as $i => $preset)
                                <input type="radio" name="amount_mvr" id="wt-preset-{{ $i }}" value="{{ number_format($preset, 2, '.', '') }}" @checked($pickedIsPreset ? $preset === $pickedMvr : ($pickedMvr === null && $i === 0))>
                                <label for="wt-preset-{{ $i }}">MVR {{ number_format($preset, 0) }}</label>
                            @endforeach
                        </div>
                    @endif
                    <div class="wt-custom">
                        <label for="wt-custom">Or another amount (MVR)</label>
                        <input id="wt-custom" name="custom_mvr" inputmode="decimal" value="{{ $pickedMvr !== null && !$pickedIsPreset ? number_format($pickedMvr, 2, '.', '') : '' }}" placeholder="{{ number_format($minMvr, 0) }}{{ $maxMvr ? ' to ' . number_format($maxMvr, 0) : ' or more' }}" autocomplete="off">
                    </div>
                @endif
                <div class="doc-actions">
                    <button type="submit" class="doc-btn doc-btn-primary" data-pay-cta="wallet-topup" style="cursor:pointer;">
                        {{ !$picks ? 'Pay MVR ' . $amountMvr . ' by card' : 'Pay by card' }}
                    </button>
                </div>
                <p class="wt-note">You will be taken to BML to pay securely. The money shows in your wallet as soon as the bank confirms it, and we text you.</p>
            </form>
        @else
            <div class="doc-banner doc-banner--warn" data-topup-closed>
                @if ($status === 'expired')
                    This link has expired. Ask us for a new one, or add money from the app.
                @else
                    This top-up was cancelled. Ask us for a new link, or add money from the app.
                @endif
            </div>
            <div class="doc-actions">
                <a class="doc-btn doc-btn-primary" href="{{ $appUrl }}">Open the app</a>
            </div>
        @endif

        @include('partials.document-print-footer')
    </div>
</div>
@endsection

@push('scripts')
    <script nonce="{{ csp_nonce() }}">
        document.querySelectorAll('.doc-btn-print').forEach(function (btn) {
            btn.addEventListener('click', function () { window.print(); });
        });
        // Typing an amount of your own lets go of the picked preset.
        var custom = document.getElementById('wt-custom');
        if (custom) {
            custom.addEventListener('input', function () {
                var any = custom.value.trim() !== '';
                document.querySelectorAll('.wt-choices input').forEach(function (r) { if (any) { r.checked = false; } });
            });
            document.querySelectorAll('.wt-choices input').forEach(function (r) {
                r.addEventListener('change', function () { custom.value = ''; });
            });
        }
    </script>
@endpush
