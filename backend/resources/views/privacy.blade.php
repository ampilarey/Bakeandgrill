@extends('layout')

@section('title', 'Privacy Policy - Bake & Grill')

@section('styles')
<style>
    .privacy-content {
        max-width: 900px;
        margin: 3rem auto 4rem;
        padding: 0 2rem;
    }

    .privacy-content h1 {
        font-size: 2.5rem;
        margin-bottom: 1rem;
    }

    .privacy-content h2 {
        font-size: 1.5rem;
        margin-top: 2.5rem;
        margin-bottom: 1rem;
        color: var(--teal);
    }

    .privacy-content p {
        margin-bottom: 1rem;
        line-height: 1.8;
    }

    .privacy-content ul {
        margin-bottom: 1rem;
        padding-left: 2rem;
    }

    .privacy-content li {
        margin-bottom: 0.5rem;
    }
</style>
@endsection

@section('content')
<div class="privacy-content">
    <h1>Privacy Policy</h1>
    <p><em>Last updated: {{ date('F d, Y') }}</em></p>

    <h2>Introduction</h2>
    <p>Bake & Grill ("we", "us", "our") operates the Bake & Grill café and online ordering system. This Privacy Policy explains how we collect, use, and protect your personal information when you use our services.</p>

    <h2>Information We Collect</h2>
    <p>When you place an order or use our services, we collect:</p>
    <ul>
        <li><strong>Phone Number:</strong> Used for OTP authentication and order notifications via SMS</li>
        <li><strong>Name:</strong> Optional, for personalized service</li>
        <li><strong>Email:</strong> Optional, for e-receipts and updates</li>
        <li><strong>Order History:</strong> To provide loyalty rewards and improve service</li>
        <li><strong>Location/Delivery Address:</strong> If delivery service is used</li>
    </ul>

    <h2>How We Use Your Information</h2>
    <p>We use your information to:</p>
    <ul>
        <li>Process and fulfill your orders</li>
        <li>Send OTP codes for secure login</li>
        <li>Send order confirmations and updates via SMS or email</li>
        <li>Provide customer support</li>
        <li>Send promotional offers (only with your consent)</li>
        <li>Improve our menu and services</li>
    </ul>

    <h2>SMS Communications</h2>
    <p>By providing your phone number, you consent to receive:</p>
    <ul>
        <li>OTP verification codes (required for login)</li>
        <li>Order confirmation messages</li>
        <li>Promotional offers (you can opt out anytime)</li>
    </ul>
    <p><strong>Opt-Out:</strong> To stop receiving promotional SMS, reply STOP to any promotional message or contact us at +960 9120011.</p>

    <h2>Data Security</h2>
    <p>We implement industry-standard security measures to protect your data, including:</p>
    <ul>
        <li>Encrypted data transmission (HTTPS)</li>
        <li>Secure OTP hashing</li>
        <li>Access controls and authentication</li>
        <li>Regular security audits</li>
    </ul>

    <h2>Data Sharing</h2>
    <p>We do not sell or share your personal information with third parties, except:</p>
    <ul>
        <li>Dhiraagu (our SMS provider) - only phone numbers for message delivery</li>
        <li>Payment processors - for order payments</li>
        <li>As required by law</li>
    </ul>

    <h2>Your Rights</h2>
    <p>You have the right to:</p>
    <ul>
        <li>Access your personal data</li>
        <li>Request data correction or deletion</li>
        <li>Opt out of promotional communications</li>
        <li>Withdraw consent at any time</li>
    </ul>

    <h2>Contact Us</h2>
    <p>For privacy-related questions or requests, contact us:</p>
    <p><strong>Email:</strong> privacy@bakeandgrill.mv</p>
    <p><strong>Phone:</strong> +960 9120011</p>
    <p><strong>Address:</strong> Majeedhee Magu, Malé, Maldives</p>
</div>
@endsection
