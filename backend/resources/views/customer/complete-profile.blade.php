@extends('layout')

@section('title', 'Set Up Your Account - Bake & Grill')

@section('styles')
<style>
    .setup-container {
        min-height: 70vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 3rem 2rem;
        background: linear-gradient(135deg, rgba(212, 129, 58, 0.08), rgba(184, 168, 144, 0.08));
    }

    .setup-card {
        background: white;
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 3rem;
        max-width: 500px;
        width: 100%;
        box-shadow: 0 12px 32px rgba(0,0,0,0.1);
    }

    .setup-card h1 {
        font-size: 2rem;
        margin-bottom: 0.5rem;
        color: var(--dark);
        text-align: center;
    }

    .setup-card .subtitle {
        text-align: center;
        color: #636e72;
        margin-bottom: 2.5rem;
        font-size: 1rem;
    }

    .form-group {
        margin-bottom: 1.5rem;
    }

    .form-group label {
        display: block;
        font-weight: 500;
        margin-bottom: 0.6rem;
        color: var(--dark);
        font-size: 0.95rem;
    }

    .form-group .optional {
        font-weight: 400;
        color: #95a5a6;
        font-size: 0.8rem;
        margin-left: 0.3rem;
    }

    .form-group input {
        width: 100%;
        padding: 0.9rem 1.1rem;
        border: 2px solid var(--border);
        border-radius: 12px;
        font-size: 1rem;
        transition: all 0.2s;
        box-sizing: border-box;
        font-family: inherit;
    }

    .form-group input:focus {
        outline: none;
        border-color: var(--amber);
        box-shadow: 0 0 0 4px rgba(212, 129, 58, 0.12);
    }

    .form-group .hint {
        font-size: 0.78rem;
        color: #95a5a6;
        margin-top: 0.35rem;
    }

    .btn-submit {
        width: 100%;
        padding: 1.15rem;
        background: var(--amber);
        color: white;
        border: none;
        border-radius: 999px;
        font-weight: 600;
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(212, 129, 58, 0.3);
        font-family: inherit;
    }

    .btn-submit:hover {
        background: var(--amber-hover);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(212, 129, 58, 0.4);
    }

    .alert {
        padding: 1rem 1.25rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;
        font-size: 0.95rem;
    }

    .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }

    @media (max-width: 768px) {
        .setup-container { padding: 2rem 1rem; }
        .setup-card { padding: 2rem 1.5rem; }
        .setup-card h1 { font-size: 1.6rem; }
    }
</style>
@endsection

@section('content')
<div class="setup-container">
    <div class="setup-card">
        <div style="text-align:center; font-size:3rem; margin-bottom:1rem;">👋</div>
        <h1>One last step</h1>
        <p class="subtitle">Set your name and a password so you can sign in easily next time.</p>

        @if($errors->any())
            <div class="alert alert-error">⚠️ {{ $errors->first() }}</div>
        @endif

        <form method="POST" action="{{ route('customer.complete-profile.post') }}">
            @csrf

            <div class="form-group">
                <label for="name">Your Name</label>
                <input
                    type="text"
                    id="name"
                    name="name"
                    value="{{ old('name') }}"
                    placeholder="e.g. Ahmed Ali"
                    autofocus
                    autocomplete="name"
                >
            </div>

            <div class="form-group">
                <label for="email">Email <span class="optional">(optional)</span></label>
                <input
                    type="email"
                    id="email"
                    name="email"
                    value="{{ old('email') }}"
                    placeholder="you@example.com"
                    autocomplete="email"
                >
            </div>

            <div class="form-group">
                <label for="password">Password</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    placeholder="At least 6 characters"
                    autocomplete="new-password"
                >
                <p class="hint">You'll use this to sign in next time — no more OTP needed.</p>
            </div>

            <div class="form-group">
                <label for="password_confirmation">Confirm Password</label>
                <input
                    type="password"
                    id="password_confirmation"
                    name="password_confirmation"
                    placeholder="Repeat your password"
                    autocomplete="new-password"
                >
            </div>

            <button type="submit" class="btn-submit">Create Account →</button>
        </form>

        <p style="margin-top:1.5rem; text-align:center; font-size:0.8rem; color:#b2bec3;">
            You can skip this by going directly to
            <a href="/order/menu" style="color:var(--amber);">the menu</a>.
        </p>
    </div>
</div>
@endsection
