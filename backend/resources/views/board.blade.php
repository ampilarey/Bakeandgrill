{{--
    The wall board — the screen in the kitchen and the one behind the till.

    Deliberately a Blade page rather than a sixth React app:

      - It has no build step, so a fix here reaches the live screens through
        the ordinary deploy instead of needing scripts/build-all.sh and a
        committed bundle. The screens are the surface least likely to be
        looked at when something breaks, so they should be the surface with
        the fewest moving parts between a fix and the wall.
      - It **polls** rather than using the KDS's SSE stream. An unattended
        kiosk that loses an event stream stays silently blank; a poll that
        fails simply succeeds again eight seconds later, and the staleness
        banner below makes a genuine outage impossible to mistake for a
        quiet afternoon.

    Everything shown comes from /api/board/orders, which carries no money,
    no payment state and no address — see App\Http\Controllers\Api\BoardController.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="robots" content="noindex, nofollow">
    <title>Order board — {{ $siteName }}</title>
    <link rel="icon" type="image/png" href="{{ $favicon }}">
    <link rel="stylesheet" href="{{ asset('css/fonts.css') }}">
    @verbatim
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
            --bg: #0d0a06;
            --panel: #17110a;
            --panel-2: #1f1710;
            --line: #33261a;
            --text: #f7ecdc;
            --muted: #a08a70;
            --amber: #f0a04b;
            --online: #f0a04b;
            --staff: #6b7f9e;
            --ready: #4ade80;
            --preparing: #facc15;
            --late: #f87171;
        }

        html, body { height: 100%; }

        body {
            font-family: var(--font-ui, system-ui, -apple-system, "Segoe UI", sans-serif);
            background: var(--bg);
            color: var(--text);
            -webkit-font-smoothing: antialiased;
            overflow: hidden;
            /* A kiosk gets tapped by people with flour on their hands. */
            -webkit-user-select: none;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        }

        /* ── Chrome ─────────────────────────────────────────────────── */

        .board {
            display: flex;
            flex-direction: column;
            height: 100vh;
            height: 100dvh;
        }

        .board-bar {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.7rem 1.1rem;
            background: var(--panel);
            border-bottom: 1px solid var(--line);
            flex: 0 0 auto;
        }

        .board-title {
            font-size: 1.15rem;
            font-weight: 800;
            letter-spacing: -0.01em;
            display: flex;
            align-items: baseline;
            gap: 0.6rem;
        }
        .board-title small {
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--muted);
        }

        .board-counts { display: flex; gap: 0.5rem; margin-left: auto; }

        .count {
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 4.2rem;
            padding: 0.25rem 0.6rem;
            border-radius: 10px;
            background: var(--panel-2);
            border: 1px solid var(--line);
            line-height: 1.15;
        }
        .count b { font-size: 1.35rem; font-weight: 800; font-variant-numeric: tabular-nums; }
        .count span {
            font-size: 0.62rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
        }
        .count--online b { color: var(--online); }

        .board-tools { display: flex; gap: 0.4rem; }

        .tool {
            min-height: 40px;
            min-width: 44px;
            padding: 0 0.75rem;
            border-radius: 10px;
            border: 1px solid var(--line);
            background: var(--panel-2);
            color: var(--muted);
            font: inherit;
            font-size: 0.85rem;
            font-weight: 700;
            cursor: pointer;
        }
        .tool:hover { color: var(--text); border-color: var(--amber); }
        .tool[hidden] { display: none; }
        .tool--alert { color: #0d0a06; background: var(--amber); border-color: var(--amber); }

        /* ── The staleness banner ───────────────────────────────────────
           The single most important element on the page. A board that has
           quietly stopped updating looks exactly like a quiet afternoon,
           and that is how an online order gets missed. */
        .board-stale {
            flex: 0 0 auto;
            display: none;
            padding: 0.7rem 1.1rem;
            background: #4c1210;
            border-bottom: 2px solid var(--late);
            color: #ffd9d6;
            font-size: 1rem;
            font-weight: 800;
            letter-spacing: 0.01em;
        }
        .board.is-stale .board-stale { display: block; }
        .board.is-stale .board-grid { opacity: 0.45; }

        /* ── The grid ───────────────────────────────────────────────── */

        .board-grid {
            flex: 1 1 auto;
            overflow-y: auto;
            padding: 0.9rem;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
            gap: 0.9rem;
            align-content: start;
            /* Cards size to their own contents. Without this every card in a
               row grows to match the longest ticket, and a two-line order
               becomes a mostly-empty panel. */
            align-items: start;
            transition: opacity 0.2s;
        }

        .ticket {
            position: relative;
            display: flex;
            flex-direction: column;
            border-radius: 14px;
            background: var(--panel);
            border: 1px solid var(--line);
            border-left: 8px solid var(--staff);
            padding: 0.85rem 0.95rem 0.9rem;
            overflow: hidden;
        }

        /* An online order has to be obvious from the far side of the room,
           so it differs by colour, by weight and by a moving element — not
           by one of the three. */
        .ticket--online {
            border-left-color: var(--online);
            background: linear-gradient(100deg, rgba(240, 160, 75, 0.14), var(--panel) 55%);
        }
        .ticket--fresh::after {
            content: "";
            position: absolute;
            inset: 0;
            border-radius: 14px;
            border: 2px solid var(--online);
            animation: pulse 1.4s ease-in-out infinite;
            pointer-events: none;
        }
        @keyframes pulse { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.15; } }
        @media (prefers-reduced-motion: reduce) {
            .ticket--fresh::after { animation: none; opacity: 0.9; }
        }

        .ticket-top {
            display: flex;
            align-items: flex-start;
            gap: 0.6rem;
            margin-bottom: 0.5rem;
        }

        .ticket-number {
            font-size: 1.7rem;
            font-weight: 800;
            letter-spacing: -0.02em;
            line-height: 1.05;
            font-variant-numeric: tabular-nums;
            overflow-wrap: anywhere;
            min-width: 0;
        }

        .ticket-age {
            margin-left: auto;
            flex-shrink: 0;
            text-align: right;
            font-size: 1.35rem;
            font-weight: 800;
            font-variant-numeric: tabular-nums;
            color: var(--muted);
            line-height: 1.05;
        }
        .ticket-age.is-late { color: var(--late); }

        .ticket-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
            margin-bottom: 0.6rem;
        }

        .tag {
            padding: 0.2rem 0.55rem;
            border-radius: 999px;
            font-size: 0.7rem;
            font-weight: 800;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            border: 1px solid transparent;
        }
        .tag--online { background: var(--online); color: #241503; }
        .tag--staff { background: transparent; color: var(--staff); border-color: var(--staff); }
        .tag--type { background: var(--panel-2); color: var(--muted); border-color: var(--line); }
        .tag--pending { background: transparent; color: var(--muted); border-color: var(--line); }
        .tag--confirmed { background: transparent; color: var(--text); border-color: var(--text); }
        .tag--preparing { background: var(--preparing); color: #2b1d00; }
        .tag--ready { background: var(--ready); color: #04240f; }

        .ticket-items {
            list-style: none;
            display: grid;
            gap: 0.22rem;
            font-size: 1.05rem;
            line-height: 1.3;
        }
        .ticket-items li { display: flex; gap: 0.55rem; }
        .ticket-items b {
            flex: 0 0 auto;
            min-width: 1.6rem;
            font-weight: 800;
            color: var(--amber);
            font-variant-numeric: tabular-nums;
        }
        .ticket-items span { min-width: 0; overflow-wrap: anywhere; }
        .ticket-more { color: var(--muted); font-size: 0.9rem; margin-top: 0.35rem; }

        /* ── Empty and pairing states ───────────────────────────────── */

        .board-empty {
            grid-column: 1 / -1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            min-height: 55vh;
            color: var(--muted);
            text-align: center;
        }
        .board-empty strong { font-size: 1.6rem; font-weight: 800; color: var(--text); }

        .pair {
            position: fixed;
            inset: 0;
            z-index: 20;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 1.25rem;
            background: var(--bg);
        }
        .board.needs-pairing .pair { display: flex; }

        .pair-card {
            width: 100%;
            max-width: 30rem;
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 18px;
            padding: 1.5rem;
        }
        .pair-card h1 { font-size: 1.4rem; font-weight: 800; margin-bottom: 0.4rem; }
        .pair-card p { color: var(--muted); line-height: 1.55; margin-bottom: 1rem; }
        .pair-card ol { color: var(--muted); line-height: 1.6; margin: 0 0 1rem 1.1rem; }
        .pair-card input {
            width: 100%;
            min-height: 52px;
            padding: 0 0.9rem;
            border-radius: 12px;
            border: 1px solid var(--line);
            background: var(--panel-2);
            color: var(--text);
            font: inherit;
            font-size: 1rem;
            margin-bottom: 0.75rem;
            -webkit-user-select: text;
            user-select: text;
        }
        .pair-card button {
            width: 100%;
            min-height: 52px;
            border-radius: 12px;
            border: 0;
            background: var(--amber);
            color: #241503;
            font: inherit;
            font-size: 1.05rem;
            font-weight: 800;
            cursor: pointer;
        }
        .pair-error { color: var(--late); font-weight: 700; margin-top: 0.75rem; }
        .pair-error:empty { display: none; }

        /* ── Wide screens: a TV is further away than a monitor ───────── */
        @media (min-width: 1600px) {
            .board-grid { grid-template-columns: repeat(auto-fill, minmax(23rem, 1fr)); }
            .ticket-number { font-size: 2.1rem; }
            .ticket-items { font-size: 1.2rem; }
        }
    </style>
    @endverbatim
</head>
<body>
<div class="board needs-pairing" id="board">
    <div class="board-bar">
        <div class="board-title">
            {{ $siteName }} <small>Order board</small>
        </div>
        <div class="board-counts">
            <div class="count count--online"><b id="count-online">0</b><span>Online</span></div>
            <div class="count"><b id="count-staff">0</b><span>Till</span></div>
            <div class="count"><b id="count-all">0</b><span>Active</span></div>
        </div>
        <div class="board-tools">
            <button type="button" class="tool tool--alert" id="sound-btn" hidden>🔔 Enable sound</button>
            <button type="button" class="tool" id="full-btn" title="Fullscreen">⛶</button>
            <button type="button" class="tool" id="unpair-btn" title="Forget this board key">⏻</button>
        </div>
    </div>

    <div class="board-stale" id="stale" role="alert"></div>

    <div class="board-grid" id="grid">
        <div class="board-empty">
            <strong>Connecting…</strong>
        </div>
    </div>

    <div class="pair">
        <form class="pair-card" id="pair-form">
            <h1>Pair this screen</h1>
            <p>This screen shows live orders. It needs its own board key — a cashier's login will not do.</p>
            <ol>
                <li>On the admin dashboard, open <strong>Devices</strong>.</li>
                <li>Under <strong>Order boards</strong>, add a board and copy the key.</li>
                <li>Paste it below. It is stored on this screen only.</li>
            </ol>
            <input type="password" id="pair-key" placeholder="Paste the board key" autocomplete="off"
                   autocapitalize="off" autocorrect="off" spellcheck="false" required>
            <button type="submit">Start the board</button>
            <p class="pair-error" id="pair-error" role="alert"></p>
        </form>
    </div>
</div>

<script nonce="{{ csp_nonce() }}">
(function () {
    'use strict';

    var FEED = '{{ url('/api/board/orders') }}';
    var KEY = 'bg-board-key';
    var POLL_MS = 8000;
    // A board is stale well before staff would notice on their own. Three
    // missed polls is about half a minute — short enough to catch a dropped
    // wifi link, long enough not to flap on one slow response.
    var STALE_MS = 30000;
    var LATE_MS = 15 * 60 * 1000;
    // How long a ticket keeps its pulse after it lands.
    var FRESH_MS = 90000;

    var board = document.getElementById('board');
    var grid = document.getElementById('grid');
    var stale = document.getElementById('stale');
    var pairForm = document.getElementById('pair-form');
    var pairKey = document.getElementById('pair-key');
    var pairError = document.getElementById('pair-error');
    var soundBtn = document.getElementById('sound-btn');

    var counts = {
        online: document.getElementById('count-online'),
        staff: document.getElementById('count-staff'),
        all: document.getElementById('count-all')
    };

    var token = null;
    var lastOk = 0;
    // order id → the moment it arrived while this screen was already watching.
    // Orders present on the first poll are recorded as null: they were here
    // before the screen was, so they neither chime nor pulse. Otherwise every
    // reboot would announce the whole board as new.
    var seen = Object.create(null);
    var primed = false;
    var timer = null;

    function store(get, set) {
        try { return set === undefined ? localStorage.getItem(get) : localStorage.setItem(get, set); }
        catch (e) { return null; }
    }

    /* ── Sound ───────────────────────────────────────────────────────
       Two notes from an oscillator rather than an audio file, so the
       board needs no asset and works with a bare `default-src 'self'`.
       Browsers keep the context suspended until a gesture, so the bar
       offers an unlock button whenever it is not running. */
    var audio = null;

    function audioCtx() {
        if (audio) { return audio; }
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) { return null; }
        try { audio = new Ctor(); } catch (e) { audio = null; }
        return audio;
    }

    function refreshSoundBtn() {
        var ctx = audio;
        soundBtn.hidden = !!(ctx && ctx.state === 'running');
    }

    function chime() {
        var ctx = audioCtx();
        if (!ctx || ctx.state !== 'running') { refreshSoundBtn(); return; }
        [[880, 0], [1320, 0.16]].forEach(function (note) {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = note[0];
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + note[1]);
            gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + note[1] + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + note[1] + 0.5);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + note[1]);
            osc.stop(ctx.currentTime + note[1] + 0.55);
        });
    }

    function unlockSound() {
        var ctx = audioCtx();
        if (!ctx) { soundBtn.hidden = true; return; }
        ctx.resume().then(function () { refreshSoundBtn(); chime(); }, refreshSoundBtn);
    }

    soundBtn.addEventListener('click', unlockSound);

    /* ── Keeping the screen awake ────────────────────────────────── */
    var wakeLock = null;

    function keepAwake() {
        if (!navigator.wakeLock) { return; }
        navigator.wakeLock.request('screen').then(function (lock) {
            wakeLock = lock;
            lock.addEventListener('release', function () { wakeLock = null; });
        }, function () { /* refused — the kiosk's own settings win */ });
    }

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            if (!wakeLock) { keepAwake(); }
            load();
        }
    });

    /* ── Rendering ───────────────────────────────────────────────── */

    var STATUS_LABEL = {
        pending: 'New',
        confirmed: 'Confirmed',
        preparing: 'Making',
        ready: 'Ready'
    };

    var TYPE_LABEL = {
        dine_in: 'Dine-in',
        takeaway: 'Takeaway',
        online_pickup: 'Pickup',
        delivery: 'Delivery',
        catering: 'Catering'
    };

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) { node.className = cls; }
        // textContent throughout: order numbers and item names are entered by
        // staff and by customers, and this screen must not execute either.
        if (text !== undefined && text !== null) { node.textContent = String(text); }
        return node;
    }

    function ageText(ms) {
        var mins = Math.floor(ms / 60000);
        // Seconds only below a minute, so the staleness banner cannot open
        // with "0m ago" while the screen is arguing that it is out of date.
        if (mins < 1) { return Math.max(Math.floor(ms / 1000), 0) + 's'; }
        if (mins < 60) { return mins + 'm'; }
        return Math.floor(mins / 60) + 'h' + String(mins % 60).padStart(2, '0');
    }

    function ticketNode(order, now) {
        var online = order.is_customer_placed === true;
        var placed = Date.parse(order.created_at || '');
        var age = isFinite(placed) ? now - placed : 0;
        var arrived = seen[order.id];

        var card = el('div', 'ticket' + (online ? ' ticket--online' : ''));
        if (online && arrived && now - arrived < FRESH_MS) {
            card.className += ' ticket--fresh';
        }

        var top = el('div', 'ticket-top');
        top.appendChild(el('div', 'ticket-number', order.order_number || ('#' + order.id)));
        var ageNode = el('div', 'ticket-age' + (age > LATE_MS ? ' is-late' : ''), ageText(Math.max(age, 0)));
        top.appendChild(ageNode);
        card.appendChild(top);

        var tags = el('div', 'ticket-tags');
        tags.appendChild(el(
            'span',
            online ? 'tag tag--online' : 'tag tag--staff',
            online ? 'Online' : (order.placed_by ? 'Till · ' + order.placed_by : 'Till')
        ));
        var status = String(order.status || '');
        tags.appendChild(el('span', 'tag tag--' + status, STATUS_LABEL[status] || status));
        var type = String(order.type || '');
        if (type) {
            tags.appendChild(el('span', 'tag tag--type', TYPE_LABEL[type] || type.replace(/_/g, ' ')));
        }
        if (order.table) {
            tags.appendChild(el('span', 'tag tag--type', 'Table ' + order.table));
        }
        card.appendChild(tags);

        var list = el('ul', 'ticket-items');
        (order.items || []).forEach(function (line) {
            var li = el('li');
            li.appendChild(el('b', null, '×' + line.quantity));
            li.appendChild(el('span', null, line.name));
            list.appendChild(li);
        });
        card.appendChild(list);

        var shown = (order.items || []).reduce(function (sum, line) { return sum + (line.quantity || 0); }, 0);
        if (order.item_count > shown) {
            card.appendChild(el('div', 'ticket-more', '+ ' + (order.item_count - shown) + ' more'));
        }

        return card;
    }

    function render(orders) {
        var now = Date.now();
        var online = 0;

        grid.textContent = '';

        if (!orders.length) {
            var empty = el('div', 'board-empty');
            empty.appendChild(el('strong', null, 'No orders waiting'));
            empty.appendChild(el('div', null, 'New orders appear here on their own.'));
            grid.appendChild(empty);
        } else {
            orders.forEach(function (order) {
                if (order.is_customer_placed === true) { online += 1; }
                grid.appendChild(ticketNode(order, now));
            });
        }

        counts.online.textContent = String(online);
        counts.staff.textContent = String(orders.length - online);
        counts.all.textContent = String(orders.length);
    }

    /* ── Polling ─────────────────────────────────────────────────── */

    function markStale() {
        if (!lastOk) { return; }
        var gap = Date.now() - lastOk;
        if (gap > STALE_MS) {
            board.classList.add('is-stale');
            stale.textContent = 'NOT UPDATING — this screen last reached the till '
                + ageText(gap) + ' ago. Check orders on the POS.';
        } else {
            board.classList.remove('is-stale');
        }
    }

    function load() {
        if (!token) { return Promise.resolve(); }

        return fetch(FEED, {
            headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
            cache: 'no-store'
        }).then(function (res) {
            if (res.status === 401 || res.status === 403) {
                // Revoked or expired. Stop showing customer names.
                forget('This board key is no longer valid. Pair the screen again.');
                return null;
            }
            if (!res.ok) { throw new Error('HTTP ' + res.status); }
            return res.json();
        }).then(function (data) {
            if (!data) { return; }
            var orders = data.orders || [];
            var now = Date.now();
            var fresh = false;

            var live = Object.create(null);
            orders.forEach(function (order) {
                live[order.id] = true;
                if (seen[order.id] === undefined) {
                    // null on the first poll: already here, so not an arrival.
                    seen[order.id] = primed ? now : null;
                    if (primed && order.is_customer_placed === true) { fresh = true; }
                }
            });
            // Forget finished orders so a repeated order number cannot
            // suppress its own chime an hour later.
            Object.keys(seen).forEach(function (id) {
                if (!live[id]) { delete seen[id]; }
            });

            lastOk = now;
            primed = true;
            render(orders);
            markStale();
            if (fresh) { chime(); }
        }).catch(function () {
            markStale();
        });
    }

    function start() {
        board.classList.remove('needs-pairing');
        keepAwake();
        refreshSoundBtn();
        load();
        if (timer) { clearInterval(timer); }
        timer = setInterval(function () { load(); markStale(); }, POLL_MS);
    }

    function forget(message) {
        token = null;
        try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
        if (timer) { clearInterval(timer); timer = null; }
        lastOk = 0;
        primed = false;
        seen = Object.create(null);
        board.classList.remove('is-stale');
        board.classList.add('needs-pairing');
        pairKey.value = '';
        pairError.textContent = message || '';
    }

    pairForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var value = pairKey.value.trim();
        if (!value) { return; }
        pairError.textContent = 'Checking…';

        fetch(FEED, {
            headers: { 'Authorization': 'Bearer ' + value, 'Accept': 'application/json' },
            cache: 'no-store'
        }).then(function (res) {
            if (!res.ok) {
                pairError.textContent = res.status === 401 || res.status === 403
                    ? 'That key was not accepted. Copy it again from Devices → Order boards.'
                    : 'Could not reach the till (HTTP ' + res.status + '). Check the network.';
                return;
            }
            token = value;
            store(KEY, value);
            pairError.textContent = '';
            // The submit tap is the gesture browsers require, so this is the
            // one moment sound can be unlocked without asking again.
            unlockSound();
            start();
        }).catch(function () {
            pairError.textContent = 'Could not reach the till. Check the network.';
        });
    });

    document.getElementById('unpair-btn').addEventListener('click', function () {
        if (window.confirm('Forget the board key on this screen?')) { forget(''); }
    });

    document.getElementById('full-btn').addEventListener('click', function () {
        if (document.fullscreenElement) { document.exitFullscreen(); }
        else if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(function () { /* refused */ });
        }
    });

    token = store(KEY);
    if (token) { start(); }
})();
</script>
</body>
</html>
