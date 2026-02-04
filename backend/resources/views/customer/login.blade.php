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
        background: linear-gradient(135deg, rgba(27, 163, 185, 0.08), rgba(184, 168, 144, 0.08));
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
        color: var(--teal);
        text-align: center;
    }

    .login-card p {
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
    }

    .form-group input:focus {
        outline: none;
        border-color: var(--teal);
        box-shadow: 0 0 0 4px rgba(27, 163, 185, 0.1);
    }

    .form-group input[type="password"] {
        letter-spacing: 0.5rem;
        text-align: center;
        font-family: monospace;
        font-size: 1.5rem;
    }

    .btn-submit {
        width: 100%;
        padding: 1.25rem;
        background: var(--teal);
        color: white;
        border: none;
        border-radius: 999px;
        font-weight: 600;
        font-size: 1.15rem;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(27, 163, 185, 0.3);
    }

    .btn-submit:hover {
        background: var(--teal-hover);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(27, 163, 185, 0.4);
    }

    .alert {
        padding: 1rem 1.25rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;
        font-size: 0.95rem;
    }

    .alert-success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
    }

    .alert-error {
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
    }

    .alert-info {
        background: #fff3cd;
        color: #856404;
        border: 1px solid #ffeaa7;
    }
    
    @media (max-width: 768px) {
        .login-container {
            padding: 2rem 1rem;
        }
        
        .login-card {
            padding: 2rem 1.5rem;
        }
        
        .login-card h1 {
            font-size: 1.75rem;
        }
        
        .login-card p {
            font-size: 0.95rem;
        }
        
        .form-group input {
            padding: 0.85rem 1rem;
            font-size: 1rem;
        }
        
        .btn-submit {
            padding: 1rem;
            font-size: 1rem;
        }
    }
</style>
@endsection

@section('content')
<div class="login-container">
    <div class="login-card">
        <div style="text-align: center; font-size: 3.5rem; margin-bottom: 1rem;">🔐</div>
        <h1>Customer Login</h1>
        <p>Sign in to view orders and manage your account</p>

        @if(session('otp_hint'))
            <div class="alert alert-info">
                💡 {{ session('otp_hint') }}
            </div>
        @endif

        @if($errors->any())
            <div class="alert alert-error">
                ⚠️ {{ $errors->first() }}
            </div>
        @endif

        @if(!session('otp_requested'))
            <form method="POST" action="{{ route('customer.request-otp') }}">
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

                <button type="submit" class="btn-submit">
                    Send Verification Code →
                </button>
            </form>
        @else
            <form method="POST" action="{{ route('customer.verify-otp') }}">
                @csrf
                <input type="hidden" name="phone" value="{{ session('phone') }}">
                
                <div class="form-group">
                    <label for="otp">🔐 Enter 6-Digit Code</label>
                    <input 
                        type="password" 
                        id="otp" 
                        name="otp" 
                        maxlength="6"
                        placeholder="● ● ● ● ● ●"
                        autofocus
                        autocomplete="off"
                    >
                </div>

                <button type="submit" class="btn-submit">
                    Verify & Login →
                </button>
                
                <p style="text-align: center; margin-top: 1.5rem;">
                    <a href="{{ route('customer.login') }}" style="color: var(--teal); font-weight: 500;">← Use different number</a>
                </p>
            </form>
        @endif

        <p style="margin-top: 2rem; font-size: 0.85rem; text-align: center; color: #95a5a6;">
            <a href="/" style="color: var(--teal);">← Back to Home</a>
        </p>
    </div>
</div>
@endsection
