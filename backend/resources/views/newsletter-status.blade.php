@extends('layout')

{{-- Newsletter confirm and unsubscribe pages (iruali import plan, feature 4). --}}
@section('title', 'Newsletter – ' . content('site_name', 'Bake & Grill'))
@section('description', 'Your ' . content('site_name', 'Bake & Grill') . ' newsletter.')

@section('styles')
<style>
.nl-wrap { max-width: 480px; margin: 0 auto; padding: 2.5rem 1rem 4rem; box-sizing: border-box; }
.nl-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem 1.25rem; }
.nl-card h1 { font-size: 1.5rem; font-weight: 800; color: var(--dark); margin: 0 0 0.5rem; }
.nl-lead { font-size: 0.95rem; color: var(--muted); margin: 0 0 1.25rem; line-height: 1.55; }
.nl-btn { display: flex; width: 100%; min-height: 48px; align-items: center; justify-content: center; border-radius: 12px; font: inherit; font-weight: 700; font-size: 1rem; cursor: pointer; border: 0; background: var(--amber); color: #fff; text-decoration: none; }
</style>
@endsection

@section('content')
<div class="nl-wrap">
    <div class="nl-card" data-testid="newsletter-status">
        @if ($state === 'confirmed')
            <h1>You're on the list</h1>
            <p class="nl-lead">Thanks. Our newsletter will come to {{ $email }}. Every one has a link to stop it.</p>
            <a class="nl-btn" href="/menu">See the menu</a>
        @elseif ($state === 'ask')
            <h1>Stop the newsletter?</h1>
            <p class="nl-lead">No more newsletters to {{ $email }}. Order and sign-in emails still come.</p>
            <form method="post" action="{{ $action }}">
                @csrf
                <button type="submit" class="nl-btn">Stop the newsletter</button>
            </form>
        @elseif ($state === 'stopped')
            <h1>Done</h1>
            <p class="nl-lead">You will get no more newsletters at {{ $email }}.</p>
        @elseif ($state === 'check_email')
            <h1>Check your email</h1>
            <p class="nl-lead">We sent a link to confirm. Nothing comes until you click it.</p>
        @else
            <h1>That link has expired</h1>
            <p class="nl-lead">Sign up again from the bottom of any page.</p>
        @endif
    </div>
</div>
@endsection
