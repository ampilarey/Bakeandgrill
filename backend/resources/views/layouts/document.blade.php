@php
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
    $logoUrl  = \App\Models\SiteSetting::get('logo', asset('logo.png'));
    $phone    = \App\Models\SiteSetting::get('business_phone', '+960 912 0011');
    $address  = \App\Models\SiteSetting::get('business_address', 'Kalaafaanu Hingun, Malé, Maldives');
    $favicon  = \App\Models\SiteSetting::get('favicon', $logoUrl);
    $docWidth = trim($__env->yieldContent('doc_width')) ?: '720px';
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', $siteName)</title>
    <link rel="icon" type="image/png" href="{{ $favicon }}">
    <script>if(localStorage.getItem('theme')==='dark')document.documentElement.dataset.theme='dark';</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    @verbatim
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
            --amber: #D4813A;
            --amber-hover: #B86820;
            --amber-light: #FEF3E8;
            --dark: #1C1408;
            --surface: #FFFFFF;
            --bg: #FFFDF9;
            --border: #EDE4D4;
            --text: #2A1E0C;
            --muted: #8B7355;
            --success-bg: #D6F0E2;
            --success-text: #195C36;
            --warn-bg: #fffbeb;
            --warn-text: #92400e;
            --warn-border: #fcd34d;
            --danger-bg: #FCE4E1;
            --danger-text: #8C1C0E;
        }
        [data-theme="dark"] {
            --amber: #e09242;
            --amber-hover: #c97a2a;
            --amber-light: rgba(224,146,66,0.15);
            --dark: #f5e6cc;
            --surface: #231809;
            --bg: #1a1208;
            --border: #3a2a12;
            --text: #e8d5b5;
            --muted: #9c8060;
            --success-bg: #0d2d1a;
            --success-text: #4ade80;
            --warn-bg: rgba(250,204,21,0.1);
            --warn-text: #fde047;
            --warn-border: rgba(250,204,21,0.25);
            --danger-bg: #2d0f0a;
            --danger-text: #f87171;
        }
        body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            min-height: 100vh;
            -webkit-font-smoothing: antialiased;
        }
        a { color: inherit; text-decoration: none; }
        .doc-header {
            position: sticky;
            top: 0;
            z-index: 50;
            background: rgba(255, 253, 249, 0.92);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border-bottom: 1px solid var(--border);
        }
        [data-theme="dark"] .doc-header { background: rgba(26, 18, 8, 0.94); }
        .doc-header-inner {
            max-width: 1280px;
            margin: 0 auto;
            padding: 0.75rem 1.25rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }
        .doc-brand {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            font-size: 1.15rem;
            font-weight: 800;
            color: var(--dark);
            letter-spacing: -0.02em;
        }
        .doc-brand img { width: 38px; height: 38px; border-radius: 9px; object-fit: cover; }
        .doc-header-links { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .doc-link {
            padding: 0.45rem 0.85rem;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--muted);
            border: 1px solid transparent;
        }
        .doc-link:hover { color: var(--amber); background: var(--amber-light); }
        .doc-link-primary {
            background: var(--amber);
            color: #fff !important;
            border-color: var(--amber);
        }
        .doc-link-primary:hover { background: var(--amber-hover); border-color: var(--amber-hover); }
        .doc-main {
            margin: 0 auto;
            padding: 1.25rem 1rem 2.5rem;
        }
        .doc-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 1.25rem 1.125rem;
            box-shadow: 0 2px 12px rgba(28, 20, 8, 0.06);
        }
        .doc-eyebrow {
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--muted);
            margin-bottom: 0.25rem;
        }
        .doc-title {
            font-size: 1.35rem;
            font-weight: 800;
            color: var(--dark);
            letter-spacing: -0.02em;
            margin-bottom: 0.25rem;
        }
        .doc-subtitle { color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem; }
        .doc-banner {
            border-radius: 12px;
            padding: 0.75rem 0.875rem;
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 1.125rem;
            line-height: 1.45;
        }
        .doc-banner--warn { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text); }
        .doc-banner--ok { background: var(--success-bg); border: 1px solid #86efac; color: var(--success-text); }
        .doc-meta { display: grid; gap: 0.5rem; margin-bottom: 1.125rem; font-size: 0.9rem; }
        .doc-meta-row { display: flex; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
        .doc-meta-row span:first-child { color: var(--muted); font-weight: 600; }
        .doc-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1.5rem; margin: 1rem 0; font-size: 0.9rem; }
        @media (max-width: 540px) { .doc-meta-grid { grid-template-columns: 1fr; } }
        .doc-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 0.5rem; }
        .doc-table th {
            text-align: left;
            color: var(--muted);
            font-weight: 700;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            padding: 0.5rem 0;
            border-bottom: 2px solid var(--border);
        }
        .doc-table td { padding: 0.625rem 0; border-bottom: 1px solid var(--border); vertical-align: top; }
        .doc-table .qty { text-align: center; width: 2.5rem; color: var(--muted); font-weight: 600; }
        .doc-table .amount { text-align: right; font-weight: 700; white-space: nowrap; }
        .doc-mods { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }
        .doc-totals { margin-top: 1rem; padding-top: 0.75rem; border-top: 2px solid var(--border); }
        .doc-totals p { display: flex; justify-content: space-between; margin: 0.35rem 0; font-size: 0.95rem; }
        .doc-totals .grand { font-size: 1.15rem; font-weight: 800; color: var(--amber); margin-top: 0.625rem; }
        .doc-payments { margin-top: 0.875rem; padding-top: 0.75rem; border-top: 1px dashed var(--border); }
        .doc-payments h3 { margin: 0 0 0.5rem; font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .doc-pay-row { display: flex; justify-content: space-between; font-size: 0.9rem; padding: 0.25rem 0; }
        .doc-actions { display: flex; flex-wrap: wrap; gap: 0.625rem; margin-top: 1.25rem; }
        .doc-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 44px;
            padding: 0 1rem;
            border-radius: 10px;
            border: 1px solid var(--border);
            font-size: 0.95rem;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            background: var(--surface);
            color: var(--text);
        }
        .doc-btn-primary { background: var(--amber); border-color: var(--amber); color: #fff; }
        .doc-btn-primary:hover { background: var(--amber-hover); border-color: var(--amber-hover); }
        .doc-badge {
            display: inline-block;
            padding: 0.25rem 0.625rem;
            border-radius: 999px;
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.03em;
        }
        .doc-badge--paid { background: var(--success-bg); color: var(--success-text); }
        .doc-badge--draft { background: var(--amber-light); color: var(--muted); }
        .doc-badge--sent { background: #eff6ff; color: #1d4ed8; }
        .doc-badge--unpaid { background: var(--danger-bg); color: var(--danger-text); }
        [data-theme="dark"] .doc-badge--sent { background: rgba(96,165,250,0.15); color: #93c5fd; }
        .doc-alert { padding: 0.625rem 0.75rem; border-radius: 10px; margin-bottom: 0.75rem; font-size: 0.9rem; }
        .doc-alert--success { background: var(--success-bg); color: var(--success-text); border: 1px solid #86efac; }
        .doc-alert--error { background: var(--danger-bg); color: var(--danger-text); border: 1px solid #fecaca; }
        .doc-refund { color: var(--danger-text); font-weight: 700; }
        .doc-feedback { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
        .doc-feedback h3 { margin: 0 0 0.75rem; font-size: 1rem; }
        .doc-feedback label { display: block; font-size: 0.8rem; color: var(--muted); font-weight: 600; margin-bottom: 0.25rem; }
        .doc-feedback select, .doc-feedback textarea {
            width: 100%;
            padding: 0.625rem 0.75rem;
            border-radius: 10px;
            border: 1px solid var(--border);
            font-size: 0.95rem;
            font-family: inherit;
            background: var(--surface);
            color: var(--text);
        }
        .doc-feedback textarea { min-height: 88px; resize: vertical; }
        .doc-footer {
            max-width: 1280px;
            margin: 0 auto;
            padding: 1.5rem 1.25rem 2rem;
            border-top: 1px solid var(--border);
            text-align: center;
            color: var(--muted);
            font-size: 0.85rem;
        }
        .doc-footer strong { color: var(--text); }
        @media print {
            .doc-header, .doc-footer, .doc-actions, .doc-feedback, .doc-alert, .doc-banner { display: none !important; }
            body { background: #fff; }
            .doc-card { box-shadow: none; border: none; padding: 0; }
            .doc-totals .grand { color: #1C1408; }
        }
    </style>
    @endverbatim
    <style>.doc-main { max-width: {{ $docWidth }}; }</style>
    @stack('head')
</head>
<body>
    <header class="doc-header">
        <div class="doc-header-inner">
            <a href="{{ url('/') }}" class="doc-brand" aria-label="{{ $siteName }} — home">
                <img src="{{ $logoUrl }}" alt="">
                <span>{{ $siteName }}</span>
            </a>
            <nav class="doc-header-links" aria-label="Document navigation">
                <a class="doc-link" href="{{ url('/') }}">Home</a>
                <a class="doc-link doc-link-primary" href="{{ url('/order/menu') }}">Order online</a>
            </nav>
        </div>
    </header>

    <main class="doc-main">
        @yield('content')
    </main>

    <footer class="doc-footer">
        <p><strong>{{ $siteName }}</strong></p>
        @if ($address)<p>{{ $address }}</p>@endif
        @if ($phone)<p>{{ $phone }}</p>@endif
    </footer>

    @stack('scripts')
</body>
</html>
