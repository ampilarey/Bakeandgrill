@extends('layout')

@section('title', 'Make a Complaint – ' . content('site_name', 'Bake & Grill'))
@section('description', 'Tell ' . content('site_name', 'Bake & Grill') . ' about a problem with our staff, food or service. Anonymous, or leave your number and we will message you back.')

@section('styles')
<style>
.page-hero {
    background: linear-gradient(160deg, var(--amber-light) 0%, var(--bg) 60%);
    border-bottom: 1px solid var(--border);
    padding: 3rem 1.25rem 2.5rem;
    text-align: center;
}
.page-hero-eyebrow {
    display: inline-block; font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em; color: var(--amber); margin-bottom: 0.75rem;
}
.page-hero h1 { font-size: 2.25rem; font-weight: 800; letter-spacing: -0.04em; color: var(--dark); margin-bottom: 0.6rem; }
.page-hero p { font-size: 1rem; color: var(--muted); max-width: 34rem; margin: 0 auto; }
@media (max-width: 600px) { .page-hero h1 { font-size: 1.8rem; } }

.cb-wrap { max-width: 560px; margin: 0 auto; padding: 2rem 1rem 4rem; box-sizing: border-box; }
.cb-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.25rem; }
.cb-lead { font-weight: 700; color: var(--dark); margin: 0 0 0.35rem; }
.cb-hint { font-size: 0.85rem; color: var(--muted); margin: 0 0 0.75rem; }
.cb-cats { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
.cb-cat {
    min-height: 44px; padding: 0.55rem 0.95rem; border-radius: 999px;
    border: 1.5px solid var(--border); background: var(--surface); color: var(--text);
    font: inherit; font-weight: 600; font-size: 0.95rem; cursor: pointer;
}
.cb-cat[aria-pressed="true"] { background: var(--amber); border-color: var(--amber); color: #fff; }
.cb-field { display: block; margin-bottom: 0.9rem; }
/* display:block above would otherwise beat the browser's [hidden] rule. */
.cb-wrap [hidden] { display: none !important; }
.cb-field > span { display: block; font-size: 0.85rem; font-weight: 700; color: var(--dark); margin-bottom: 0.3rem; }
.cb-field input[type="text"], .cb-field input[type="tel"], .cb-field input[type="date"], .cb-field textarea {
    width: 100%; box-sizing: border-box; min-height: 48px; padding: 0.7rem 0.85rem;
    border: 1.5px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text);
    font: inherit; font-size: 16px;
}
.cb-field textarea { min-height: 110px; resize: vertical; }
.cb-who { display: grid; gap: 0.5rem; margin-bottom: 0.9rem; }
.cb-who label {
    display: flex; align-items: flex-start; gap: 0.65rem; padding: 0.8rem 0.9rem;
    border: 1.5px solid var(--border); border-radius: 12px; cursor: pointer; font-size: 0.95rem;
}
.cb-who label:has(input:checked) { border-color: var(--amber); background: var(--amber-light); }
.cb-who input { margin-top: 0.2rem; width: 18px; height: 18px; flex-shrink: 0; }
.cb-who small { display: block; color: var(--muted); font-size: 0.8rem; margin-top: 0.15rem; }
.cb-send {
    width: 100%; min-height: 52px; border: none; border-radius: 12px;
    background: var(--amber); color: #fff; font: inherit; font-weight: 700; font-size: 1.05rem; cursor: pointer;
}
.cb-send:disabled { opacity: 0.5; cursor: not-allowed; }
.cb-error { color: #b91c1c; font-size: 0.9rem; margin: 0.6rem 0 0; }
.cb-done { text-align: center; padding: 1.5rem 1rem; }
.cb-done h2 { font-size: 1.4rem; color: var(--dark); margin: 0 0 0.5rem; }
.cb-done p { color: var(--muted); margin: 0 0 0.5rem; }
.cb-done .cb-ref { font-size: 1.6rem; font-weight: 800; color: var(--amber); letter-spacing: 0.02em; margin: 0.5rem 0 1rem; }
.cb-foot { font-size: 0.8rem; color: var(--muted); text-align: center; margin-top: 1rem; }
.cb-foot a { color: var(--amber); }
</style>
@endsection

@section('content')
<div class="page-hero">
    <span class="page-hero-eyebrow">We want to know</span>
    <h1>Make a complaint</h1>
    <p>Something not right with our staff, food or service? Tell us here. It goes straight to the owner. You can stay anonymous, or leave your number and we will message you back.</p>
</div>

<div class="cb-wrap">
    <form
        class="cb-card"
        data-complaint-box
        data-endpoint="{{ $endpoint }}"
        data-max="{{ $maxCategories }}"
        data-staff-cats="{{ implode(',', $staffCategories) }}"
        novalidate
    >
        <p class="cb-lead">What is it about?</p>
        <p class="cb-hint">Tap one or more.</p>
        <div class="cb-cats" role="group" aria-label="What the complaint is about">
            @foreach ($categories as $cat)
                <button type="button" class="cb-cat" data-cat="{{ $cat['value'] }}" aria-pressed="false">{{ $cat['label'] }}</button>
            @endforeach
        </div>

        <label class="cb-field" data-staff-field hidden>
            <span>Who served you? (optional)</span>
            <input type="text" name="about_staff" maxlength="120" placeholder="A name, or what they looked like" autocomplete="off">
        </label>

        <label class="cb-field">
            <span>Tell us what happened</span>
            <textarea name="comment" maxlength="2000" placeholder="What happened, and when"></textarea>
        </label>

        <label class="cb-field">
            <span>Order or receipt number (optional)</span>
            <input type="text" name="order_ref" maxlength="40" value="{{ $orderRef }}" autocomplete="off">
        </label>

        <label class="cb-field">
            <span>When was this? (optional)</span>
            <input type="date" name="visited_on" max="{{ now()->toDateString() }}">
        </label>

        <p class="cb-lead">How should we get back to you?</p>
        <div class="cb-who">
            <label>
                <input type="radio" name="anonymous" value="1" checked>
                <span>Stay anonymous<small>We will not know who you are. We still read every one.</small></span>
            </label>
            <label>
                <input type="radio" name="anonymous" value="0">
                <span>Message me on my mobile<small>You get an SMS when we take it up and when it is sorted.</small></span>
            </label>
        </div>
        <label class="cb-field" data-phone-field hidden>
            <span>Your mobile number</span>
            <input type="tel" name="phone" inputmode="tel" maxlength="20" placeholder="7xxxxxx" autocomplete="tel">
        </label>

        {{-- Bots fill every box. People never see this one. --}}
        <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
        <input type="hidden" name="source" value="{{ $source }}">

        <button type="submit" class="cb-send" data-send disabled>Send complaint</button>
        <p class="cb-error" data-error hidden></p>
    </form>

    <div class="cb-card cb-done" data-done hidden>
        <h2>Thank you</h2>
        <p data-confirm></p>
        <p class="cb-ref" data-ref></p>
        <p>Keep the reference if you want to ask about it later.</p>
    </div>

    <p class="cb-foot">A problem with a specific order? The complaint form on your receipt page links it to that order. Or <a href="/contact">contact us</a>.</p>
</div>

{{-- Inline: the marketing layout has no script stack, only @yield('content'). --}}
<script nonce="{{ csp_nonce() }}">
(function () {
    var form = document.querySelector('[data-complaint-box]');
    if (!form) return;
    var max = parseInt(form.getAttribute('data-max'), 10) || 3;
    var staffCats = (form.getAttribute('data-staff-cats') || '').split(',');
    var selected = [];
    var send = form.querySelector('[data-send]');
    var err = form.querySelector('[data-error]');
    var staffField = form.querySelector('[data-staff-field]');
    var phoneField = form.querySelector('[data-phone-field]');
    var done = document.querySelector('[data-done]');

    function paint() {
        form.querySelectorAll('[data-cat]').forEach(function (b) {
            b.setAttribute('aria-pressed', selected.indexOf(b.getAttribute('data-cat')) !== -1 ? 'true' : 'false');
        });
        var aboutStaff = selected.some(function (c) { return staffCats.indexOf(c) !== -1; });
        if (staffField) staffField.hidden = !aboutStaff;
        if (send) send.disabled = selected.length === 0;
    }

    form.querySelectorAll('[data-cat]').forEach(function (b) {
        b.addEventListener('click', function () {
            var v = b.getAttribute('data-cat');
            var i = selected.indexOf(v);
            if (i !== -1) selected.splice(i, 1);
            else if (selected.length < max) selected.push(v);
            paint();
        });
    });

    form.querySelectorAll('input[name="anonymous"]').forEach(function (r) {
        r.addEventListener('change', function () {
            var anon = form.querySelector('input[name="anonymous"]:checked').value === '1';
            if (phoneField) phoneField.hidden = anon;
            if (!anon) { var p = form.querySelector('input[name="phone"]'); if (p) p.focus(); }
        });
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!selected.length || send.disabled) return;
        err.hidden = true; err.textContent = '';
        var anon = form.querySelector('input[name="anonymous"]:checked').value === '1';
        var val = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? (el.value || '').trim() : ''; };
        if (!anon && !val('phone')) {
            err.hidden = false; err.textContent = 'Enter your mobile number, or choose to stay anonymous.';
            return;
        }
        send.disabled = true; send.textContent = 'Sending…';
        var body = {
            categories: selected.slice(),
            comment: val('comment') || null,
            about_staff: staffField && !staffField.hidden ? (val('about_staff') || null) : null,
            order_ref: val('order_ref') || null,
            visited_on: val('visited_on') || null,
            anonymous: anon,
            phone: anon ? null : val('phone'),
            source: val('source') || 'web',
            website: val('website')
        };
        fetch(form.getAttribute('data-endpoint'), {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(body),
            credentials: 'same-origin'
        }).then(function (res) {
            return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        }).then(function (r) {
            if (!r.ok) {
                var msg = (r.data && r.data.message) || 'Could not send. Please try again.';
                if (r.data && r.data.errors) {
                    var first = Object.keys(r.data.errors)[0];
                    if (first && r.data.errors[first][0]) msg = r.data.errors[first][0];
                }
                err.hidden = false; err.textContent = msg;
                send.disabled = false; send.textContent = 'Send complaint';
                return;
            }
            form.hidden = true;
            done.hidden = false;
            done.querySelector('[data-confirm]').textContent = r.data.confirmation || 'Recorded.';
            done.querySelector('[data-ref]').textContent = r.data.reference_number || '';
            try { done.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (x) {}
        }).catch(function () {
            err.hidden = false; err.textContent = 'Could not send. Please check your connection and try again.';
            send.disabled = false; send.textContent = 'Send complaint';
        });
    });

    paint();
})();
</script>
@endsection
