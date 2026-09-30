@extends('layout')

@section('title', 'Page Not Found - Bake & Grill')

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
        background: linear-gradient(135deg, rgba(183, 75, 12, 0.06), rgba(184, 168, 144, 0.06));
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
    <div class="error-code">404</div>
    <h1>Page not found</h1>
    <p>Sorry, we couldn't find the page you're looking for. It may have moved or never existed.</p>
    <div class="error-actions">
        <a href="/" class="btn-primary-err">Back to Home</a>
        <a href="/order/" class="btn-ghost-err">Order Online</a>
    </div>
</div>
@endsection
