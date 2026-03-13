@extends('layout')

@section('title', 'Terms & Conditions - Bake & Grill')

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
        font-size: 1.05rem;
        font-weight: 700;
        margin-top: 2.25rem;
        margin-bottom: 0.75rem;
        color: var(--amber, #d97706);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-size: 0.8rem;
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
    .policy-wrap .corporate-box {
        border: 1px solid #e7e0d8;
        border-radius: 12px;
        padding: 1.25rem 1.5rem;
        background: #fffbf5;
        margin-top: 2rem;
        font-size: 0.9rem;
        line-height: 1.7;
    }
</style>
@endsection

@section('content')
<div class="policy-wrap">
    <h1>Terms &amp; Conditions</h1>
    <p class="subtitle">Please read these terms before completing your purchase.</p>

    {{-- BML Req 3: Corporate info --}}
    <div class="corporate-box">
        <strong>{{ config('business.name') }}</strong><br>
        {{ config('business.address.full') }}<br>
        Phone: <a href="tel:{{ preg_replace('/[^0-9+]/', '', config('business.phone')) }}">{{ config('business.phone') }}</a> &nbsp;|&nbsp;
        Email: <a href="mailto:{{ config('business.email') }}">{{ config('business.email') }}</a><br>
        Customer service: Available via WhatsApp, Viber, or the contact details above.
    </div>

    {{-- BML Req 2: Description of goods/services --}}
    <h2>1. About Our Services</h2>
    <p>Bake &amp; Grill operates a café and restaurant in Malé, Maldives, offering dine-in, takeaway, and delivery of freshly prepared food and beverages. Online ordering is available through our website at <strong>bakeandgrill.mv/order</strong>. Products are prepared fresh and may vary subject to availability.</p>

    {{-- BML Req 4 + 5: Currency + merchant outlet country --}}
    <h2>2. Payment &amp; Currency</h2>
    <p>All transactions are priced and charged in <strong>MVR (Maldivian Rufiyaa)</strong>. Payment is processed securely via <strong>Bank of Maldives (BML) BankConnect</strong>. The merchant outlet is located in the <strong>Maldives</strong>.</p>
    <p>We accept Visa, Mastercard, and other card brands accepted by Bank of Maldives. Card details are handled entirely by BML's secure payment page — Bake &amp; Grill does not store, view, or process your card numbers.</p>

    {{-- BML Req 8: Delivery policy --}}
    <h2>3. Delivery Policy</h2>
    <ul>
        <li><strong>Delivery area:</strong> We currently deliver within Malé city. Orders outside this area cannot be fulfilled.</li>
        <li><strong>Delivery fee:</strong> A flat fee applies, displayed at checkout before payment.</li>
        <li><strong>Estimated delivery time:</strong> 30–45 minutes from order confirmation, subject to demand and location.</li>
        <li><strong>Takeaway:</strong> Orders may also be collected in person from our store at Kalaafaanu Hingun, Malé.</li>
        <li>We reserve the right to decline orders if delivery is not feasible due to weather, distance, or operational reasons. In such cases, a full refund will be issued.</li>
    </ul>

    {{-- BML Req 6: Refund/cancellation --}}
    <h2>4. Refund &amp; Cancellation Policy</h2>
    <p>Please review our full <a href="{{ route('refund') }}">Refund &amp; Cancellation Policy</a> before purchase. In summary:</p>
    <ul>
        <li>You may cancel your order <strong>free of charge before the kitchen confirms it</strong>.</li>
        <li>Once preparation begins, cancellations are not accepted and no refund will be issued.</li>
        <li>If we are unable to fulfill your order (e.g. item unavailable, delivery not possible), a full refund will be processed within 5–7 business days.</li>
        <li>For payment disputes, contact us within 7 days of the transaction.</li>
    </ul>

    {{-- BML Req 7: Import/export --}}
    <h2>5. Import / Export &amp; Legal Restrictions</h2>
    <p>Our products are food and beverages prepared and consumed locally within the Maldives. No import, export, or customs duties apply. You are responsible for complying with any dietary, health, or local regulations applicable to you.</p>

    {{-- BML Req 9+10: Privacy + security --}}
    <h2>6. Security &amp; Card Data</h2>
    <p>All card payments are processed exclusively on the Bank of Maldives secure payment page using SSL/TLS encryption. Bake &amp; Grill does not store, view, or retain any card details on our servers. Our systems undergo regular security reviews to prevent unauthorised access to customer data.</p>

    {{-- BML Req 11: Retain transaction records --}}
    <h2>7. Transaction Records</h2>
    <p>We strongly recommend you retain a copy of your order confirmation, payment receipt, and these Terms &amp; Conditions for your records. An order receipt is available on the order status page after payment and may be emailed to you upon request.</p>

    <h2>8. Privacy</h2>
    <p>Your personal data is collected and used in accordance with our <a href="{{ route('privacy') }}">Privacy Policy</a>.</p>

    <h2>9. Governing Law</h2>
    <p>These terms are governed by the laws of the Republic of Maldives. Any disputes will be resolved through the relevant Maldivian courts or authority.</p>

    <p class="updated">Last updated: {{ date('F j, Y') }}</p>
</div>
@endsection
