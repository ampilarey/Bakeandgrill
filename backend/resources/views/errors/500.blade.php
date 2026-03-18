@extends('layout')

@section('title', 'Something went wrong - Bake & Grill')

@section('styles')
<style>
    .error-hero {
        min-height: 55vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 3rem 2rem;
        background: linear-gradient(135deg, rgba(212, 129, 58, 0.06), rgba(184, 168, 144, 0.06));
    }
    .error-code {
        font-size: 6rem;
        font-weight: 900;
        color: var(--amber);
        line-height: 1;
        margin-bottom: 0.75rem;
        letter-spacing: -0.04em;
        opacity: 0.25;
    }
    .error-hero h1 { font-size: 2rem; margin-bottom: 0.5rem; color: var(--dark); font-weight: 800; }
    .error-hero p { color: var(--muted); margin-bottom: 1.5rem; max-width: 420px; line-height: 1.6; }
    .error-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center; }
    .error-actions a {
        display: inline-block;
        padding: 0.875rem 1.75rem;
        border-radius: 999px;
        font-weight: 600;
        text-decoration: none;
        transition: all 0.2s;
    }
    .btn-primary-err { background: var(--amber); color: white; box-shadow: 0 2px 10px var(--amber-glow); }
    .btn-primary-err:hover { background: var(--amber-hover); transform: translateY(-2px); }
    .btn-ghost-err { background: transparent; color: var(--muted); border: 1.5px solid var(--border); }
    .btn-ghost-err:hover { background: var(--amber-light); color: var(--amber); border-color: var(--amber); }
</style>
@endsection

@section('content')
<div class="error-hero">
    <div class="error-code">500</div>
    <h1>Something went wrong</h1>
    <p>We're sorry — our server ran into an unexpected problem. Our team has been notified. Please try again in a moment.</p>
    <div class="error-actions">
        <a href="/" class="btn-primary-err">Back to Home</a>
        <a href="javascript:location.reload()" class="btn-ghost-err">Try again</a>
    </div>
</div>
@endsection
