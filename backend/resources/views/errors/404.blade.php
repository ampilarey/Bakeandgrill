@extends('layout')

@section('title', 'Page Not Found - Bake & Grill')

@section('styles')
<style>
    .error-hero {
        min-height: 50vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 3rem 2rem;
        background: linear-gradient(135deg, rgba(27, 163, 185, 0.06), rgba(184, 168, 144, 0.06));
    }
    .error-hero h1 { font-size: 2.5rem; margin-bottom: 0.5rem; color: var(--dark); }
    .error-hero p { color: #636e72; margin-bottom: 1.5rem; }
    .error-hero a {
        display: inline-block;
        padding: 1rem 2rem;
        background: var(--teal);
        color: white;
        border-radius: 999px;
        font-weight: 600;
        text-decoration: none;
        transition: all 0.2s;
    }
    .error-hero a:hover { background: var(--teal-hover); transform: translateY(-2px); }
</style>
@endsection

@section('content')
<div class="error-hero">
    <h1>Page not found</h1>
    <p>Sorry, we couldn't find the page you're looking for.</p>
    <a href="/">Back to Home</a>
</div>
@endsection
