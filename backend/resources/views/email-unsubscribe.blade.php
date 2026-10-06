@extends('layout')

@section('title', 'Stop promotional messages – ' . content('site_name', 'Bake & Grill'))
@section('description', 'Stop promotional SMS and email from ' . content('site_name', 'Bake & Grill') . '.')

@section('styles')
<style>
.eu-wrap { max-width: 480px; margin: 0 auto; padding: 2.5rem 1rem 4rem; box-sizing: border-box; }
.eu-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem 1.25rem; }
.eu-eyebrow { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--amber); margin: 0 0 0.4rem; }
.eu-card h1 { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.03em; color: var(--dark); margin: 0 0 0.5rem; }
.eu-lead { font-size: 0.95rem; color: var(--muted); margin: 0 0 1.25rem; line-height: 1.55; }
.eu-btn { display: flex; width: 100%; min-height: 48px; align-items: center; justify-content: center; border-radius: 12px; font: inherit; font-weight: 700; font-size: 1rem; cursor: pointer; border: 0; background: var(--amber); color: #fff; }
.eu-done { padding: 1rem 1.25rem; border-radius: 12px; background: var(--amber-light); color: var(--dark); font-weight: 700; margin-bottom: 1rem; }
.eu-fine { font-size: 0.8rem; color: var(--muted); margin: 1rem 0 0; line-height: 1.5; }
</style>
@endsection

@section('content')
<div class="eu-wrap">
    <div class="eu-card">
        <p class="eu-eyebrow">Your messages</p>
        <h1>Stop promotional messages</h1>
        @if ($done)
            <div class="eu-done" data-testid="email-unsub-done">Done. You will get no more offers or news from us, by SMS or email.</div>
            <p class="eu-lead">Order, payment and sign-in messages still come, so you never miss what matters.</p>
        @else
            <p class="eu-lead">You will stop getting offers and news, by SMS and by email. Order, payment and sign-in messages still come.</p>
            <form method="post" action="{{ $action }}">
                @csrf
                <button type="submit" class="eu-btn">Stop promotional messages</button>
            </form>
        @endif
        <p class="eu-fine">Changed your mind? Message us and we will switch them back on.</p>
    </div>
</div>
@endsection
