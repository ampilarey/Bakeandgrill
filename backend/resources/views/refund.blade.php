@extends('layout')

@section('title', 'Refund & Cancellation Policy - Bake & Grill')

@section('styles')
<style>
    .policy-wrap {
        max-width: 860px;
        margin: 3rem auto 5rem;
        padding: 0 2rem;
        font-family: inherit;
        color: var(--dark);
    }
    .policy-wrap h1 {
        font-size: 2.25rem;
        font-weight: 800;
        letter-spacing: -0.03em;
        margin-bottom: 0.5rem;
    }
    .policy-wrap .subtitle {
        color: var(--text-muted, #78716c);
        font-size: 0.975rem;
        margin-bottom: 2.5rem;
    }
    .policy-wrap h2 {
        font-size: 0.8rem;
        font-weight: 700;
        margin-top: 2.25rem;
        margin-bottom: 0.75rem;
        color: var(--amber, #d97706);
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .policy-wrap p, .policy-wrap li {
        font-size: 0.95rem;
        line-height: 1.8;
        color: #44403c;
        margin-bottom: 0.6rem;
    }
    .policy-wrap ul {
        padding-left: 1.5rem;
        margin-bottom: 1rem;
    }
    .policy-wrap a { color: var(--amber, #d97706); }
    .policy-wrap .updated {
        margin-top: 3rem;
        font-size: 0.8rem;
        color: #a8a29e;
    }
    .policy-wrap .callout {
        background: #fef3e8;
        border-left: 4px solid var(--amber, #d97706);
        border-radius: 0 8px 8px 0;
        padding: 1rem 1.25rem;
        margin: 1.5rem 0;
        font-size: 0.925rem;
        line-height: 1.7;
    }
</style>
@endsection

@section('content')
<div class="policy-wrap">
    <h1>Refund &amp; Cancellation Policy</h1>
    <p class="subtitle">Please read this policy before completing your purchase.</p>

    <div class="callout">
        <strong>Key point:</strong> You can cancel your order free of charge <em>before</em> the kitchen confirms it. Once preparation begins, cancellations are not accepted.
    </div>

    <h2>Cancellation</h2>
    <ul>
        <li><strong>Before kitchen confirmation:</strong> You may cancel your order at no charge. Contact us immediately via WhatsApp or Viber at <a href="{{ config('business.social.whatsapp') }}">{{ config('business.phone') }}</a>.</li>
        <li><strong>After kitchen confirmation:</strong> The order cannot be cancelled, as food preparation has already begun. No refund will be issued.</li>
        <li>Orders placed outside operating hours will be held pending and may be cancelled before the opening time.</li>
    </ul>

    <h2>Refunds</h2>
    <ul>
        <li><strong>Order not fulfilled by us:</strong> If we are unable to prepare or deliver your order (e.g. item unavailable, delivery area not serviceable, technical issue), you will receive a full refund.</li>
        <li><strong>Wrong or missing items:</strong> If your delivered order is incorrect or incomplete, contact us within 1 hour of delivery. We will arrange a replacement or refund for the affected items.</li>
        <li><strong>Quality issues:</strong> If food is not up to standard on arrival, contact us with a description and photo. Refunds are at our discretion.</li>
        <li><strong>Change of mind:</strong> Refunds are not issued for change of mind after preparation has started.</li>
    </ul>

    <h2>Refund Process</h2>
    <ul>
        <li>Approved refunds are processed back to the original payment method (BML card).</li>
        <li>Processing time: <strong>5–7 business days</strong> depending on your bank.</li>
        <li>You will receive confirmation once the refund has been initiated.</li>
    </ul>

    <h2>How to Request a Refund</h2>
    <p>Contact us through any of the following channels with your order number:</p>
    <ul>
        <li>WhatsApp / Viber: <a href="{{ config('business.social.whatsapp') }}">{{ config('business.phone') }}</a></li>
        <li>Phone: <a href="tel:{{ preg_replace('/[^0-9+]/', '', config('business.phone')) }}">{{ config('business.phone') }}</a></li>
        <li>Email: <a href="mailto:{{ config('business.email') }}">{{ config('business.email') }}</a></li>
        <li>In person: {{ config('business.address.line1') }}, {{ config('business.address.city') }}</li>
    </ul>

    <h2>Payment Disputes</h2>
    <p>If you believe a charge on your BML card is incorrect, please contact us within <strong>7 days</strong> of the transaction date. We will investigate and respond within 3 business days. If the issue is not resolved, you may raise a dispute directly with your card issuer (Bank of Maldives).</p>

    <p>All transactions are in <strong>MVR (Maldivian Rufiyaa)</strong>. No import/export charges or customs duties apply to our food and beverage products.</p>

    <p class="updated">Last updated: {{ date('F j, Y') }}</p>
</div>
@endsection
