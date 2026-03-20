@extends('layout')

@section('title', 'Customer Login - Bake & Grill')

@section('styles')
<style>
    .login-container {
        min-height: 70vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 3rem 2rem;
        background: linear-gradient(135deg, rgba(212, 129, 58, 0.08), rgba(184, 168, 144, 0.08));
    }

    .login-card {
        background: white;
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 3rem;
        max-width: 500px;
        width: 100%;
        box-shadow: 0 12px 32px rgba(0,0,0,0.1);
    }

    .login-card h1 {
        font-size: 2.25rem;
        margin-bottom: 0.75rem;
        color: var(--dark);
        text-align: center;
    }

    .login-card p.subtitle {
        text-align: center;
        color: #636e72;
        margin-bottom: 2.5rem;
        font-size: 1.05rem;
    }

    .form-group {
        margin-bottom: 1.75rem;
    }

    .form-group label {
        display: block;
        font-weight: 500;
        margin-bottom: 0.75rem;
        color: var(--dark);
        font-size: 1rem;
    }

    .form-group input {
        width: 100%;
        padding: 1rem 1.25rem;
        border: 2px solid var(--border);
        border-radius: 12px;
        font-size: 1.1rem;
        transition: all 0.2s;
        box-sizing: border-box;
    }

    .form-group input:focus {
        outline: none;
        border-color: var(--amber);
        box-shadow: 0 0 0 4px rgba(212, 129, 58, 0.12);
    }

    .form-group input[type="password"] {
        font-family: inherit;
    }

    .btn-submit {
        width: 100%;
        padding: 1.25rem;
        background: var(--amber);
        color: white;
        border: none;
        border-radius: 999px;
        font-weight: 600;
        font-size: 1.15rem;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(212, 129, 58, 0.3);
    }

    .btn-submit:hover {
        background: var(--amber-hover);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(212, 129, 58, 0.4);
    }

    .btn-ghost {
        width: 100%;
        padding: 0.9rem;
        background: transparent;
        color: var(--amber);
        border: 2px solid rgba(212,129,58,0.3);
        border-radius: 999px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.2s;
        margin-top: 0.75rem;
    }

    .btn-ghost:hover {
        background: rgba(212,129,58,0.07);
        border-color: var(--amber);
    }

    .alert {
        padding: 1rem 1.25rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;
        font-size: 0.95rem;
    }

    .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .alert-error   { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .alert-info    { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }

    .step-header {
        text-align: center;
        margin-bottom: 2rem;
    }
    .step-header .phone-display {
        font-weight: 700;
        color: var(--amber);
        font-size: 1.1rem;
    }

    .link-muted {
        color: var(--amber);
        font-weight: 500;
        text-decoration: none;
        font-size: 0.9rem;
    }
    .link-muted:hover { text-decoration: underline; }

    @media (max-width: 768px) {
        .login-container { padding: 2rem 1rem; }
        .login-card { padding: 2rem 1.5rem; }
        .login-card h1 { font-size: 1.75rem; }
    }
</style>
@endsection

@section('content')
<div class="login-container">
    <div class="login-card">
        <div style="text-align: center; font-size: 3.5rem; margin-bottom: 1rem;">🔐</div>

        @if(session('otp_hint'))
            <div class="alert alert-info">💡 {{ session('otp_hint') }}</div>
        @endif

        @if($errors->any())
            <div class="alert alert-error">⚠️ {{ $errors->first() }}</div>
        @endif

        @if(session('message'))
            <div class="alert alert-success">✅ {{ session('message') }}</div>
        @endif

        {{-- ── Step 1: Enter phone number ──────────────────────────────── --}}
        @if(!session('otp_requested') && !session('password_step'))
            <h1>Welcome back</h1>
            <p class="subtitle">Enter your phone number to continue</p>

            <form method="POST" action="{{ route('customer.request-otp') }}" id="phone-form">
                @csrf
                <div class="form-group">
                    <label for="phone">📱 Phone Number</label>
                    <input
                        type="text"
                        id="phone"
                        name="phone"
                        placeholder="7820288 or +9607820288"
                        value="{{ old('phone') }}"
                        autofocus
                    >
                </div>
                <button type="submit" class="btn-submit">Continue →</button>
            </form>

            {{-- For returning customers with a password, check via JS first --}}
            <p style="text-align:center; margin-top:1.25rem; font-size:0.85rem; color:#95a5a6;">
                <a href="/" class="link-muted">← Back to Home</a>
            </p>

        {{-- ── Step 2a: Password login (returning customer) ───────────── --}}
        @elseif(session('password_step'))
            <h1>Welcome back</h1>
            <div class="step-header">
                <p style="color:#636e72; margin-bottom:0.25rem;">Signing in as</p>
                <span class="phone-display">{{ session('phone') }}</span>
            </div>

            <form method="POST" action="{{ route('customer.password-login') }}">
                @csrf
                <input type="hidden" name="phone" value="{{ session('phone') }}">
                <div class="form-group">
                    <label for="password">🔒 Password</label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        placeholder="Enter your password"
                        autofocus
                        autocomplete="current-password"
                    >
                </div>
                <button type="submit" class="btn-submit">Sign in →</button>
            </form>

            <p style="text-align:center; margin-top:1.25rem; font-size:0.9rem;">
                <a href="{{ route('customer.login') }}" class="link-muted">← Use different number</a>
                &nbsp;·&nbsp;
                <a href="{{ route('customer.forgot-password') }}" class="link-muted">Forgot password?</a>
            </p>

        {{-- ── Step 2b: OTP verification (new customer / no password) ─── --}}
        @elseif(session('otp_requested'))
            <h1>Enter the code</h1>
            <div class="step-header">
                <p style="color:#636e72; margin-bottom:0.25rem;">A 6-digit code was sent to</p>
                <span class="phone-display">{{ session('phone') }}</span>
            </div>

            <form method="POST" action="{{ route('customer.verify-otp') }}">
                @csrf
                <input type="hidden" name="phone" value="{{ session('phone') }}">
                <div class="form-group">
                    <label for="otp">🔐 Verification Code</label>
                    <input
                        type="text"
                        id="otp"
                        name="otp"
                        maxlength="6"
                        inputmode="numeric"
                        pattern="[0-9]{6}"
                        placeholder="000000"
                        autofocus
                        autocomplete="one-time-code"
                        style="letter-spacing:0.4rem; font-size:1.5rem; text-align:center;"
                    >
                </div>
                <button type="submit" class="btn-submit">Verify &amp; Continue →</button>
            </form>

            <p style="text-align:center; margin-top:1.25rem;">
                <a href="{{ route('customer.login') }}" class="link-muted">← Use different number</a>
            </p>
        @endif

        <p style="margin-top: 2rem; font-size: 0.8rem; text-align: center; color: #b2bec3;">
            Your number is used only for order updates. No spam.
        </p>
    </div>
</div>
@endsection
