@extends('layout')

@section('title', 'Reset Password - Bake & Grill')

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
    .login-card h1 { font-size: 2rem; margin-bottom: 0.5rem; color: var(--dark); text-align: center; }
    .login-card .subtitle { text-align: center; color: #636e72; margin-bottom: 2rem; font-size: 1rem; }
    .form-group { margin-bottom: 1.5rem; }
    .form-group label { display: block; font-weight: 500; margin-bottom: 0.6rem; color: var(--dark); font-size: 0.95rem; }
    .form-group input {
        width: 100%; padding: 0.9rem 1.1rem; border: 2px solid var(--border);
        border-radius: 12px; font-size: 1rem; transition: all 0.2s; box-sizing: border-box; font-family: inherit;
    }
    .form-group input:focus { outline: none; border-color: var(--amber); box-shadow: 0 0 0 4px rgba(212,129,58,0.12); }
    .btn-submit {
        width: 100%; padding: 1.15rem; background: var(--amber); color: white; border: none;
        border-radius: 999px; font-weight: 600; font-size: 1.1rem; cursor: pointer;
        transition: all 0.2s; box-shadow: 0 4px 12px rgba(212,129,58,0.3); font-family: inherit;
    }
    .btn-submit:hover { background: var(--amber-hover); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(212,129,58,0.4); }
    .alert { padding: 1rem 1.25rem; border-radius: 12px; margin-bottom: 1.5rem; font-size: 0.95rem; }
    .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .alert-info  { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
    .link-muted { color: var(--amber); font-weight: 500; text-decoration: none; font-size: 0.9rem; }
    .link-muted:hover { text-decoration: underline; }
    @media (max-width: 768px) {
        .login-container { padding: 2rem 1rem; }
        .login-card { padding: 2rem 1.5rem; }
    }
</style>
@endsection

@section('content')
<div class="login-container">
    <div class="login-card">
        <div style="text-align:center; font-size:3rem; margin-bottom:1rem;">🔑</div>

        @if($errors->any())
            <div class="alert alert-error">⚠️ {{ $errors->first() }}</div>
        @endif

        @if(session('otp_hint'))
            <div class="alert alert-info">💡 {{ session('otp_hint') }}</div>
        @endif

        {{-- Step 1: Enter phone --}}
        @if(!session('reset_otp_requested') && !session('reset_verified'))
            <h1>Reset password</h1>
            <p class="subtitle">Enter your phone number and we'll send a code to reset your password.</p>

            <form method="POST" action="{{ route('customer.forgot-password.post') }}">
                @csrf
                <div class="form-group">
                    <label for="phone">📱 Phone Number</label>
                    <input type="text" id="phone" name="phone" placeholder="7820288" value="{{ old('phone') }}" autofocus>
                </div>
                <button type="submit" class="btn-submit">Send Reset Code →</button>
            </form>

        {{-- Step 2: Enter OTP --}}
        @elseif(session('reset_otp_requested') && !session('reset_verified'))
            <h1>Enter the code</h1>
            <p class="subtitle">A code was sent to <strong>{{ session('phone') }}</strong></p>

            <form method="POST" action="{{ route('customer.verify-reset-otp') }}">
                @csrf
                <input type="hidden" name="phone" value="{{ session('phone') }}">
                <div class="form-group">
                    <label for="otp">🔐 Verification Code</label>
                    <input type="text" id="otp" name="otp" maxlength="6" inputmode="numeric"
                           placeholder="000000" autofocus autocomplete="one-time-code"
                           style="letter-spacing:0.4rem; font-size:1.5rem; text-align:center;">
                </div>
                <button type="submit" class="btn-submit">Verify Code →</button>
            </form>

        {{-- Step 3: Set new password --}}
        @elseif(session('reset_verified'))
            <h1>New password</h1>
            <p class="subtitle">Choose a new password for <strong>{{ session('phone') }}</strong></p>

            <form method="POST" action="{{ route('customer.reset-password') }}">
                @csrf
                <input type="hidden" name="phone" value="{{ session('phone') }}">
                <div class="form-group">
                    <label for="password">🔒 New Password</label>
                    <input type="password" id="password" name="password" placeholder="At least 6 characters" autofocus autocomplete="new-password">
                </div>
                <div class="form-group">
                    <label for="password_confirmation">Confirm Password</label>
                    <input type="password" id="password_confirmation" name="password_confirmation" placeholder="Repeat your password" autocomplete="new-password">
                </div>
                <button type="submit" class="btn-submit">Set Password →</button>
            </form>
        @endif

        <p style="text-align:center; margin-top:1.5rem;">
            <a href="{{ route('customer.login') }}" class="link-muted">← Back to login</a>
        </p>
    </div>
</div>
@endsection
