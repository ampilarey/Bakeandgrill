@extends('layouts.document')

@php
    /** @var \App\Models\Customer $customer */
    /** @var array<string, mixed> $statement */
    $siteName = content('site_name', 'Bake & Grill');
    $tz = config('app.timezone', 'Indian/Maldives');
    $owed = (int) $statement['balance_laar'];
    $overdue = (int) $statement['overdue_laar'];
    $mvr = fn (int $laar) => number_format($laar / 100, 2);
    $badge = $owed <= 0 ? 'Nothing owed' : ($overdue > 0 ? 'Overdue' : 'Owing');
    $badgeClass = $owed <= 0 ? 'doc-badge--paid' : ($overdue > 0 ? 'doc-badge--unpaid' : 'doc-badge--sent');
    $digits = preg_replace('/\D+/', '', (string) $customer->phone);
    $maskedPhone = strlen($digits) >= 4 ? str_repeat('•', max(0, strlen($digits) - 4)) . substr($digits, -4) : '';
    $statusWord = match ((string) $statement['status']) { 'on_hold' => 'On hold', 'blocked' => 'Blocked', default => 'Active' };
@endphp

@section('title', 'Credit statement — ' . $siteName)

@push('head')
    <meta name="robots" content="noindex, nofollow">
    <style nonce="{{ csp_nonce() }}">
        .cs-amount { font-size: 2rem; font-weight: 800; color: var(--amber); margin: 0.25rem 0 0; letter-spacing: -0.02em; }
        .cs-overdue { color: var(--danger-text); font-weight: 700; }
        .cs-custom { margin-top: 0.75rem; }
        .cs-custom label { display: block; font-size: 0.85rem; color: var(--muted); font-weight: 600; margin-bottom: 0.3rem; }
        .cs-custom input {
            width: 100%; min-height: 44px; padding: 0 0.9rem; border-radius: 12px; border: 1.5px solid var(--border);
            background: var(--surface); color: var(--text); font: inherit; font-size: 16px;
        }
        .cs-custom input:focus { outline: none; border-color: var(--amber); box-shadow: 0 0 0 4px var(--amber-glow); }
        .cs-note { font-size: 0.85rem; color: var(--muted); margin: 0.75rem 0 0; line-height: 1.5; }
        .cs-row-overdue td:first-child::after { content: ' · overdue'; color: var(--danger-text); font-weight: 700; font-size: 0.8rem; }
    </style>
@endpush

@section('content')
<div class="doc-card" data-credit-statement="{{ $owed > 0 ? 'owing' : 'clear' }}">
    @include('partials.document-masthead', [
        'docType' => 'Credit statement',
        'docNumber' => now()->timezone($tz)->format('d M Y'),
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
        @if ($payment === 'CONFIRMED' && !session('success'))
            <div class="doc-banner doc-banner--ok" data-credit-banner="confirmed">Payment received. Thank you. The balance below is up to date.</div>
        @elseif ($payment !== null && $payment !== '' && $payment !== 'CONFIRMED')
            <div class="doc-banner doc-banner--warn" data-credit-banner="not-completed">Payment was not completed. Nothing was taken. You can try again below.</div>
        @endif

        <div class="doc-meta-grid">
            <div>
                <p class="doc-eyebrow">Account of</p>
                <p style="font-weight:700; margin:0;">{{ $customer->name ?: 'Customer' }}</p>
                @if ($maskedPhone !== '')
                    <p class="doc-subtitle" style="margin:0;">{{ $maskedPhone }}</p>
                @endif
                <p class="doc-subtitle" style="margin:0.25rem 0 0;">Account {{ $statusWord }} · limit MVR {{ $mvr((int) $statement['limit_laar']) }} · {{ (int) $statement['payment_terms_days'] }} days to pay</p>
            </div>
            <div>
                <p class="doc-eyebrow">You owe</p>
                <p class="cs-amount" data-credit-owed>MVR {{ $mvr($owed) }}</p>
                @if ($overdue > 0)
                    <p class="cs-overdue" style="margin:0.25rem 0 0;" data-credit-overdue>MVR {{ $mvr($overdue) }} overdue</p>
                @elseif ($owed > 0 && !empty($statement['next_due_date']))
                    <p style="margin:0.25rem 0 0; color:var(--muted);">Next due: {{ \Illuminate\Support\Carbon::parse($statement['next_due_date'])->format('d M Y') }}</p>
                @endif
            </div>
        </div>

        @if (count($statement['invoices']) > 0)
            <div class="doc-table-scroll">
                <table class="doc-table doc-table--wide" data-credit-invoices>
                    <thead>
                        <tr>
                            <th>Invoice</th>
                            <th>Due</th>
                            <th class="amount">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ($statement['invoices'] as $inv)
                            <tr class="{{ $inv['overdue'] ? 'cs-row-overdue' : '' }}">
                                <td>
                                    @if ($inv['view_url'])
                                        <a href="{{ $inv['view_url'] }}" style="color:var(--amber); font-weight:700;">{{ $inv['invoice_number'] }}</a>
                                    @else
                                        <strong>{{ $inv['invoice_number'] }}</strong>
                                    @endif
                                    @if ($inv['issue_date'])
                                        <div class="doc-mods">Issued {{ \Illuminate\Support\Carbon::parse($inv['issue_date'])->format('d M Y') }}</div>
                                    @endif
                                </td>
                                <td>{{ $inv['due_date'] ? \Illuminate\Support\Carbon::parse($inv['due_date'])->format('d M Y') : '—' }}</td>
                                <td class="amount">MVR {{ $mvr((int) $inv['balance_due_laar']) }}</td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        @else
            <p class="cs-note" data-credit-no-invoices>No open invoices.</p>
        @endif

        @if ($owed > 0)
            <form method="post" action="{{ route('credit-statement.pay', $customer->credit_statement_token) }}" data-credit-pay-form>
                <div class="cs-custom">
                    <label for="cs-custom">Pay part of it instead (MVR, optional)</label>
                    <input id="cs-custom" name="custom_mvr" inputmode="decimal" placeholder="Leave empty to pay MVR {{ $mvr($owed) }}" autocomplete="off">
                </div>
                <div class="doc-actions">
                    <button type="submit" class="doc-btn doc-btn-primary" data-pay-cta="credit-statement" style="cursor:pointer;">Pay by card</button>
                    <button type="button" class="doc-btn doc-btn-print">Print</button>
                </div>
                <p class="cs-note">You will be taken to BML to pay securely. The payment goes against your oldest invoices first, and we text you what is left.</p>
            </form>
        @else
            <div class="doc-actions">
                <button type="button" class="doc-btn doc-btn-print">Print</button>
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
    </script>
@endpush
