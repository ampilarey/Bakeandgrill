@extends('layout')

@section('title', 'Make a Complaint – ' . content('site_name', 'Bake & Grill'))
@section('description', 'Tell ' . content('site_name', 'Bake & Grill') . ' about a problem with our staff, food or service. Anonymous, or leave your number and we will message you back.')

@section('styles')
<style>
/* Phone first: one column. From 900px the form stands beside "What happens next". */
.cb-hero {
    position: relative; overflow: hidden;
    background: var(--dark) url('/brand/flame-pattern.svg') center / 220px;
    color: var(--amber-contrast); padding: 2.25rem 1.25rem 2rem; text-align: center;
}
.cb-hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(28, 20, 8, 0.86), rgba(28, 20, 8, 0.94)); }
.cb-hero > * { position: relative; }
.cb-eyebrow { display: inline-block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--amber-on-dark); margin-bottom: 0.6rem; }
.cb-hero h1 { font-size: 1.8rem; font-weight: 800; letter-spacing: -0.04em; color: #fff; margin: 0 0 0.5rem; }
.cb-hero p { font-size: 1rem; color: rgba(255, 253, 249, 0.82); max-width: 34rem; margin: 0 auto; }
.cb-trust { list-style: none; margin: 1.1rem auto 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; max-width: 40rem; }
.cb-trust li {
    display: inline-flex; align-items: center; gap: 0.4rem; min-height: 32px; padding: 0.3rem 0.75rem;
    border-radius: 999px; border: 1px solid rgba(255, 253, 249, 0.22); background: rgba(255, 253, 249, 0.08);
    font-size: 0.82rem; font-weight: 600; color: #fff;
}
.cb-trust svg { color: var(--amber-on-dark); flex-shrink: 0; }

.cb-wrap { max-width: 560px; margin: 0 auto; padding: 1.25rem 1rem 4rem; box-sizing: border-box; display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
/* display rules below would otherwise beat the browser's [hidden] rule. */
.cb-wrap [hidden] { display: none !important; }
.cb-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.1rem; box-shadow: 0 6px 24px rgba(28, 20, 8, 0.05); }
.cb-about { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 1rem; padding: 0.6rem 0.8rem; border-radius: 12px; background: var(--amber-light); color: var(--dark); font-size: 0.9rem; font-weight: 600; }
.cb-about svg { color: var(--amber); flex-shrink: 0; }
.cb-step { border: 0; margin: 0 0 1.25rem; padding: 0; min-width: 0; }
.cb-step + .cb-step { border-top: 1px solid var(--border); padding-top: 1.1rem; }
.cb-lead { display: flex; align-items: center; gap: 0.6rem; font-weight: 800; color: var(--dark); margin: 0 0 0.3rem; padding: 0; font-size: 1.02rem; }
.cb-num { width: 26px; height: 26px; border-radius: 50%; background: var(--amber); color: #fff; font-size: 0.82rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cb-hint { font-size: 0.85rem; color: var(--muted); margin: 0 0 0.75rem; }
.cb-cats { display: grid; gap: 0.5rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); }
.cb-cat {
    min-height: 48px; padding: 0.55rem 0.75rem; border-radius: 12px; text-align: start;
    border: 1.5px solid var(--border); background: var(--surface); color: var(--text);
    font: inherit; font-weight: 600; font-size: 0.92rem; line-height: 1.2; cursor: pointer;
    display: flex; align-items: center; gap: 0.55rem;
    transition: border-color 0.15s, background-color 0.15s;
}
.cb-cat svg { color: var(--amber); flex-shrink: 0; }
.cb-cat[aria-pressed="true"] { background: var(--amber); border-color: var(--amber); color: #fff; }
.cb-cat[aria-pressed="true"] svg { color: #fff; }
.cb-cat:disabled { opacity: 0.45; cursor: not-allowed; }
.cb-count { font-size: 0.8rem; color: var(--muted); margin: 0.5rem 0 0; min-height: 1.1em; }
.cb-field { display: block; margin-bottom: 0.9rem; }
.cb-field > span { display: block; font-size: 0.85rem; font-weight: 700; color: var(--dark); margin-bottom: 0.3rem; }
.cb-field input[type="text"], .cb-field input[type="tel"], .cb-field input[type="date"], .cb-field textarea {
    width: 100%; box-sizing: border-box; min-height: 48px; padding: 0.7rem 0.85rem;
    border: 1.5px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text);
    font: inherit; font-size: 16px;
}
.cb-field input:focus, .cb-field textarea:focus { outline: none; border-color: var(--amber); box-shadow: 0 0 0 3px var(--amber-glow); }
.cb-field textarea { min-height: 120px; resize: vertical; }
.cb-field small { display: block; font-size: 0.78rem; color: var(--muted); margin-top: 0.3rem; }
.cb-left { text-align: end; }
.cb-days { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.4rem; }
.cb-day { min-height: 32px; padding: 0.25rem 0.8rem; border-radius: 999px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.cb-day[aria-pressed="true"] { border-color: var(--amber); background: var(--amber-light); color: var(--amber); }
.cb-more { border: 1.5px solid var(--border); border-radius: 12px; margin-bottom: 0.2rem; }
.cb-more > summary { min-height: 48px; padding: 0 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; cursor: pointer; font-weight: 700; font-size: 0.92rem; color: var(--dark); list-style: none; }
.cb-more > summary::-webkit-details-marker { display: none; }
.cb-more > summary::after { content: '+'; font-size: 1.2rem; color: var(--amber); }
.cb-more[open] > summary::after { content: '\2212'; }
.cb-more > div { padding: 0 0.85rem 0.2rem; }
.cb-who { display: grid; gap: 0.5rem; margin-bottom: 0.9rem; }
.cb-who label {
    display: flex; align-items: flex-start; gap: 0.65rem; padding: 0.8rem 0.9rem;
    border: 1.5px solid var(--border); border-radius: 12px; cursor: pointer; font-size: 0.95rem; font-weight: 600; color: var(--dark);
}
.cb-who label:has(input:checked) { border-color: var(--amber); background: var(--amber-light); }
.cb-who input { margin-top: 0.2rem; width: 18px; height: 18px; flex-shrink: 0; accent-color: var(--amber); }
.cb-who small { display: block; color: var(--muted); font-size: 0.8rem; font-weight: 400; margin-top: 0.15rem; }
.cb-send {
    width: 100%; min-height: 52px; border: none; border-radius: 12px;
    background: var(--amber); color: #fff; font: inherit; font-weight: 700; font-size: 1.05rem; cursor: pointer;
}
.cb-send:hover:not(:disabled) { background: var(--amber-hover); }
.cb-send:disabled { opacity: 0.5; cursor: not-allowed; }
.cb-need { font-size: 0.82rem; color: var(--muted); text-align: center; margin: 0.6rem 0 0; }
.cb-error { color: #b91c1c; font-size: 0.9rem; margin: 0.6rem 0 0; text-align: center; }
/* The box bots fill and people never see: clipped where it stands, never pushed off the side of the page. */
.cb-trap { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); opacity: 0; }

.cb-done { text-align: center; padding: 1.75rem 1.1rem; }
.cb-tick { width: 64px; height: 64px; border-radius: 50%; background: var(--amber-light); color: var(--amber); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 0.75rem; }
.cb-done h2 { font-size: 1.5rem; color: var(--dark); margin: 0 0 0.5rem; }
.cb-done p { color: var(--muted); margin: 0 0 0.5rem; }
.cb-refbox { margin: 1rem auto; padding: 0.9rem; border: 1.5px dashed var(--amber); border-radius: 14px; background: var(--amber-light); max-width: 320px; }
.cb-refbox small { display: block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.cb-done .cb-ref { font-size: 1.6rem; font-weight: 800; color: var(--amber); letter-spacing: 0.02em; margin: 0.2rem 0 0.5rem; overflow-wrap: anywhere; }
.cb-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; min-height: 44px; padding: 0 1.1rem;
    border-radius: 12px; border: 1.5px solid var(--border); background: var(--surface); color: var(--dark);
    font: inherit; font-weight: 700; font-size: 0.92rem; text-decoration: none; cursor: pointer;
}
.cb-btn.primary { background: var(--amber); border-color: var(--amber); color: #fff; }
.cb-btns { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-top: 1rem; }

.cb-side { display: grid; gap: 1rem; align-content: start; }
.cb-side h2 { font-size: 1rem; font-weight: 800; color: var(--dark); margin: 0 0 0.75rem; }
.cb-next { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.85rem; }
.cb-next li { display: flex; gap: 0.7rem; align-items: flex-start; font-size: 0.9rem; color: var(--text); }
.cb-next svg { color: var(--amber); flex-shrink: 0; margin-top: 0.1rem; }
.cb-next b { display: block; color: var(--dark); }
.cb-next span { color: var(--muted); }
.cb-now p { font-size: 0.9rem; color: var(--muted); margin: 0 0 0.75rem; }
.cb-foot { font-size: 0.8rem; color: var(--muted); text-align: center; margin: 0; }
.cb-foot a { color: var(--amber); }

@media (min-width: 601px) {
    .cb-hero { padding: 3rem 1.25rem 2.5rem; }
    .cb-hero h1 { font-size: 2.25rem; }
    .cb-card { padding: 1.5rem; }
}
@media (min-width: 900px) {
    .cb-wrap { max-width: 980px; grid-template-columns: minmax(0, 1fr) 320px; gap: 1.5rem; padding-top: 2rem; align-items: start; }
    .cb-side { position: sticky; top: 5.5rem; }
}
@media (prefers-reduced-motion: reduce) { .cb-cat { transition: none; } }
</style>
@endsection

@php
    // One drawn icon per category (never emoji); a category added later gets the plain one.
    $catIcons = ['staff_behaviour' => 'user', 'slow_service' => 'clock', 'food_quality' => 'utensils', 'food_safety' => 'alert-triangle', 'cleanliness' => 'droplet', 'pricing' => 'receipt', 'other' => 'message-circle'];
    $today = now()->toDateString();
    $yesterday = now()->subDay()->toDateString();
    $tel = preg_replace('/[^0-9+]/', '', $phone ?? '');
@endphp

@section('content')
<div class="cb-hero">
    <span class="cb-eyebrow">We want to know</span>
    <h1>Make a complaint</h1>
    <p>Something not right with our staff, food or service? Tell us here. It takes about a minute.</p>
    <ul class="cb-trust">
        <li>{{ \App\Support\UiIcon::svg('user', 15) }} Goes straight to the owner</li>
        <li>{{ \App\Support\UiIcon::svg('lock', 15) }} Anonymous if you like</li>
        <li>{{ \App\Support\UiIcon::svg('message-circle', 15) }} We can message you back</li>
    </ul>
</div>

<div class="cb-wrap">
    <div class="cb-main">
    <form
        class="cb-card"
        data-complaint-box
        data-endpoint="{{ $endpoint }}"
        data-max="{{ $maxCategories }}"
        data-staff-cats="{{ implode(',', $staffCategories) }}"
        novalidate
    >
        @if ($orderRef !== '')
            <p class="cb-about" data-testid="cb-about">{{ \App\Support\UiIcon::svg('receipt', 18) }} <span>About order or receipt <b>{{ $orderRef }}</b></span></p>
        @endif

        <fieldset class="cb-step">
            <legend class="cb-lead"><span class="cb-num">1</span> What is it about?</legend>
            <p class="cb-hint">Tap one or more, up to {{ $maxCategories }}.</p>
            <div class="cb-cats" role="group" aria-label="What the complaint is about">
                @foreach ($categories as $cat)
                    <button type="button" class="cb-cat" data-cat="{{ $cat['value'] }}" aria-pressed="false">{{ \App\Support\UiIcon::svg($catIcons[$cat['value']] ?? 'message-circle', 18) }}<span>{{ $cat['label'] }}</span></button>
                @endforeach
            </div>
            <p class="cb-count" data-count aria-live="polite"></p>
        </fieldset>

        <fieldset class="cb-step">
            <legend class="cb-lead"><span class="cb-num">2</span> What happened?</legend>
            <label class="cb-field" data-staff-field hidden>
                <span>Who served you? (optional)</span>
                <input type="text" name="about_staff" maxlength="120" placeholder="A name, or what they looked like" autocomplete="off">
            </label>

            <label class="cb-field">
                <span>Tell us what happened</span>
                <textarea name="comment" maxlength="2000" placeholder="What happened, and when"></textarea>
                <small class="cb-left" data-left hidden></small>
            </label>

            <details class="cb-more" @if ($orderRef !== '') open @endif>
                <summary>Add the order number or the day (optional)</summary>
                <div>
                    <label class="cb-field">
                        <span>Order or receipt number</span>
                        <input type="text" name="order_ref" maxlength="40" value="{{ $orderRef }}" autocomplete="off">
                        <small>It is printed at the top of your receipt. It helps us find what went wrong.</small>
                    </label>

                    <div class="cb-field">
                        <label><span>When was this?</span>
                        <input type="date" name="visited_on" max="{{ $today }}"></label>
                        <div class="cb-days" role="group" aria-label="When was this">
                            <button type="button" class="cb-day" data-day="{{ $today }}" aria-pressed="false">Today</button>
                            <button type="button" class="cb-day" data-day="{{ $yesterday }}" aria-pressed="false">Yesterday</button>
                        </div>
                    </div>
                </div>
            </details>
        </fieldset>

        <fieldset class="cb-step">
            <legend class="cb-lead"><span class="cb-num">3</span> How should we get back to you?</legend>
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
                <small>Used for this complaint only.</small>
            </label>
        </fieldset>

        {{-- Bots fill every box. People never see this one. --}}
        <input type="text" name="website" class="cb-trap" tabindex="-1" autocomplete="off" aria-hidden="true">
        <input type="hidden" name="source" value="{{ $source }}">

        <button type="submit" class="cb-send" data-send disabled>Send complaint</button>
        <p class="cb-need" data-need>Pick what it is about to send.</p>
        <p class="cb-error" data-error role="alert" hidden></p>
    </form>

    <div class="cb-card cb-done" data-done hidden>
        <span class="cb-tick">{{ \App\Support\UiIcon::svg('check-circle', 34) }}</span>
        <h2>Thank you</h2>
        <p data-confirm></p>
        <div class="cb-refbox">
            <small>Your reference</small>
            <p class="cb-ref" data-ref></p>
            <button type="button" class="cb-btn" data-copy>{{ \App\Support\UiIcon::svg('copy', 16) }} <span data-copy-word>Copy</span></button>
        </div>
        <p>Keep the reference if you want to ask about it later.</p>
        <div class="cb-btns">
            <a class="cb-btn primary" href="/menu">See the menu</a>
            <a class="cb-btn" href="{{ url()->current() }}">Send another</a>
        </div>
    </div>
    </div>

    <aside class="cb-side">
        <div class="cb-card">
            <h2>What happens next</h2>
            <ol class="cb-next">
                <li>{{ \App\Support\UiIcon::svg('user', 18) }}<div><b>The owner reads it</b><span>It is not passed through the staff on shift.</span></div></li>
                <li>{{ \App\Support\UiIcon::svg('search', 18) }}<div><b>We look into it</b><span>An order number or the day helps us find it.</span></div></li>
                <li>{{ \App\Support\UiIcon::svg('message-circle', 18) }}<div><b>You hear back</b><span>Only if you left your number: an SMS when we take it up and when it is sorted.</span></div></li>
            </ol>
        </div>
        @if ($tel !== '')
            <div class="cb-card cb-now">
                <h2>Need us right now?</h2>
                <p>If you are still at the shop, or it cannot wait, call us.</p>
                <a class="cb-btn" href="tel:{{ $tel }}" data-testid="cb-call">{{ \App\Support\UiIcon::svg('phone', 16) }} {{ $phone }}</a>
            </div>
        @endif
        <p class="cb-foot">A problem with a specific order? The complaint form on your receipt page links it to that order. Or <a href="/contact">contact us</a>.</p>
    </aside>
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
    var count = form.querySelector('[data-count]');
    var need = form.querySelector('[data-need]');
    var left = form.querySelector('[data-left]');

    function paint() {
        form.querySelectorAll('[data-cat]').forEach(function (b) {
            b.setAttribute('aria-pressed', selected.indexOf(b.getAttribute('data-cat')) !== -1 ? 'true' : 'false');
        });
        var aboutStaff = selected.some(function (c) { return staffCats.indexOf(c) !== -1; });
        if (staffField) staffField.hidden = !aboutStaff;
        if (send) send.disabled = selected.length === 0;
        // At the most allowed, the rest are greyed: a tap that did nothing read as a broken button.
        form.querySelectorAll('[data-cat]').forEach(function (b) {
            b.disabled = selected.length >= max && selected.indexOf(b.getAttribute('data-cat')) === -1;
        });
        if (count) count.textContent = selected.length === 0 ? '' : selected.length + ' of ' + max + ' picked' + (selected.length >= max ? '. Tap one again to change it.' : '.');
        if (need) need.hidden = selected.length > 0;
    }

    // How many letters are left, once most are used.
    var comment = form.querySelector('textarea[name="comment"]');
    if (comment && left) {
        comment.addEventListener('input', function () {
            var room = 2000 - comment.value.length;
            left.hidden = room > 300;
            left.textContent = room + ' letters left';
        });
    }

    // Today and Yesterday fill the date in a tap; a date typed by hand lights the one it matches.
    var day = form.querySelector('input[name="visited_on"]');
    var days = form.querySelectorAll('[data-day]');
    function paintDays() {
        days.forEach(function (b) { b.setAttribute('aria-pressed', day && day.value === b.getAttribute('data-day') ? 'true' : 'false'); });
    }
    days.forEach(function (b) {
        b.addEventListener('click', function () {
            if (!day) return;
            day.value = day.value === b.getAttribute('data-day') ? '' : b.getAttribute('data-day');
            paintDays();
        });
    });
    if (day) day.addEventListener('change', paintDays);

    var copy = done ? done.querySelector('[data-copy]') : null;
    if (copy) {
        copy.addEventListener('click', function () {
            var ref = (done.querySelector('[data-ref]').textContent || '').trim();
            var word = copy.querySelector('[data-copy-word]');
            var said = function (t) { if (word) { word.textContent = t; setTimeout(function () { word.textContent = 'Copy'; }, 2000); } };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(ref).then(function () { said('Copied'); }, function () { said('Press and hold the number to copy'); });
            } else { said('Press and hold the number to copy'); }
        });
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
            if (!r.data.reference_number) { var box = done.querySelector('.cb-refbox'); if (box) box.hidden = true; }
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
