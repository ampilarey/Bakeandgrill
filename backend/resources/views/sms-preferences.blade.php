@extends('layout')

@section('title', 'SMS preferences – ' . content('site_name', 'Bake & Grill'))
@section('description', 'Stop promotional SMS from ' . content('site_name', 'Bake & Grill') . '. Order and login messages are unaffected.')

@section('styles')
<style>
.sp-wrap { max-width: 480px; margin: 0 auto; padding: 2.5rem 1rem 4rem; box-sizing: border-box; }
.sp-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem 1.25rem; }
.sp-eyebrow { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--amber); margin: 0 0 0.4rem; }
.sp-card h1 { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.03em; color: var(--dark); margin: 0 0 0.5rem; }
.sp-lead { font-size: 0.95rem; color: var(--muted); margin: 0 0 1.25rem; line-height: 1.55; }
.sp-label { display: block; font-size: 0.85rem; font-weight: 700; color: var(--dark); margin: 0 0 0.35rem; }
.sp-row { display: flex; align-items: stretch; border: 1.5px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); margin-bottom: 0.9rem; }
.sp-prefix { display: flex; align-items: center; padding: 0 0.9rem; border-right: 1.5px solid var(--border); color: var(--muted); font-weight: 600; }
.sp-row input { flex: 1; min-width: 0; min-height: 48px; border: 0; padding: 0 0.9rem; font: inherit; font-size: 1.05rem; color: var(--dark); background: transparent; outline: none; }
.sp-btn { display: flex; width: 100%; min-height: 48px; align-items: center; justify-content: center; border-radius: 12px; font: inherit; font-weight: 700; font-size: 1rem; cursor: pointer; border: 0; background: var(--amber); color: #fff; }
.sp-done { padding: 1rem 1.25rem; border-radius: 12px; background: var(--amber-light); color: var(--dark); font-weight: 700; margin-bottom: 1rem; }
.sp-error { color: #b42318; font-size: 0.85rem; margin: 0 0 0.75rem; }
.sp-fine { font-size: 0.8rem; color: var(--muted); margin: 1rem 0 0; line-height: 1.5; }
</style>
@endsection

@section('content')
<div class="sp-wrap">
    <div class="sp-card">
        <p class="sp-eyebrow">SMS preferences</p>
        <h1>Stop promotional SMS</h1>
        @if($done === 'done')
            <div class="sp-done" data-testid="sms-pref-done">Done. If this number is with us, it will get no more promotional texts.</div>
        @endif
        <p class="sp-lead">Enter the number the texts arrive on. Order, payment and login messages are not affected: you still get those.</p>
        @error('phone')
            <p class="sp-error">{{ $message }}</p>
        @enderror
        <form method="post" action="{{ route('sms.preferences.opt-out') }}">
            @csrf
            <label class="sp-label" for="sp-phone">Mobile number</label>
            <div class="sp-row">
                <span class="sp-prefix" aria-hidden="true">+960</span>
                <input id="sp-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="7XXXXXX" value="{{ old('phone', $phone) }}" required>
            </div>
            <button type="submit" class="sp-btn" data-testid="sms-pref-submit">Stop promotional SMS</button>
        </form>
        <p class="sp-fine">Changed your mind? Sign in to the order app and switch promotional SMS back on under Account → Settings, or tell us at the counter.</p>
    </div>
</div>
@endsection
