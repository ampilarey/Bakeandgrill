@extends('layout')

@section('title', 'Stop offer emails – ' . content('site_name', 'Bake & Grill'))
@section('description', 'Stop offer emails, and offer texts if you like, from ' . content('site_name', 'Bake & Grill') . '.')

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
        <h1>Stop promotional email</h1>
        @if ($done)
            <div class="eu-done" data-testid="email-unsub-done">Done. You will get no more offers or news from us, by email or SMS.</div>
            <p class="eu-lead">Order, payment and sign-in messages still come, so you never miss what matters.</p>
        @elseif (!empty($emailStopped))
            <div class="eu-done" data-testid="email-unsub-done">Done. Offer emails have stopped.</div>
            <p class="eu-lead">Offer texts can still arrive. Order, payment and sign-in messages still come.</p>
            <form method="post" action="{{ $action }}" style="margin-top:1rem;">
                @csrf
                <input type="hidden" name="also_sms" value="1">
                <button type="submit" class="eu-btn">Also stop offer SMS</button>
            </form>
        @else
            <p class="eu-lead">This stops offer emails. Order, payment and sign-in messages still come. Offer texts stay on unless you also stop those.</p>
            <form method="post" action="{{ $action }}">
                @csrf
                <button type="submit" class="eu-btn">Stop offer emails</button>
            </form>
            <form method="post" action="{{ $action }}" style="margin-top:0.75rem;">
                @csrf
                <input type="hidden" name="also_sms" value="1">
                <button type="submit" class="eu-btn" style="background:transparent;color:var(--dark);border:1.5px solid var(--border);">Stop offer emails and SMS</button>
            </form>
        @endif
        <p class="eu-fine">Changed your mind? Message us and we will switch them back on.</p>
    </div>
</div>
@endsection
