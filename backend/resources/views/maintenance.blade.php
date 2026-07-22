{{--
    Branded maintenance page shown when the `marketing_site` service state is
    disabled (plan §7). This is NOT `php artisan down` — the marketing routes
    stay served and return an HTTP 503, but the app keeps running so orders,
    admin, tracking and printing continue to work.

    Data:
      - $serviceMaintenance = ['message' => string, 'retry_at' => ?ISO string]
      - SiteSetting rows provide phone / hours / address / socials
--}}
@php
    $siteName    = content('site_name',        'Bake & Grill');
    $logoUrl     = content('logo',              asset('logo.png'));
    $phone       = content('business_phone',   '+960 912 0011');
    $email       = content('business_email',   'admin@bakeandgrill.mv');
    $address     = content('business_address', 'Kalaafaanu Hingun, Malé, Maldives');
    $waLink      = content('business_whatsapp','https://wa.me/9609120011');
    $fbUrl       = content('social_facebook', '');
    $igUrl       = content('social_instagram', '');
    $tiktokUrl   = content('social_tiktok', '');
    $hoursSetting = content('business_hours', null);

    $phoneTel = 'tel:' . preg_replace('/[^+\d]/', '', $phone);
    $maintenance = $serviceMaintenance ?? [];
    $message = $maintenance['message'] ?? 'We\'re making some improvements. We\'ll be back shortly.';
    $retryAt = $maintenance['retry_at'] ?? null;
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $siteName }} — We'll be right back</title>
    <meta name="robots" content="noindex, nofollow">
    <meta name="description" content="{{ e($message) }}">
    <link rel="icon" href="{{ asset('favicon.ico') }}">
    <style>
        :root {
            --primary: #7A1F1D;
            --amber: #f59e0b;
            --amber-light: #fef3c7;
            --dark: #1f2937;
            --muted: #6b7280;
            --border: #e5e7eb;
            --bg: #fdf6f0;
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg);
            color: var(--dark);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .maintenance-shell {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem 1rem;
        }
        .maintenance-card {
            max-width: 560px;
            width: 100%;
            background: #ffffff;
            border-radius: 20px;
            box-shadow: 0 30px 60px rgba(122, 31, 29, 0.15);
            padding: 2.25rem 1.75rem;
            text-align: center;
        }
        .maintenance-logo {
            width: 96px;
            height: 96px;
            object-fit: contain;
            margin: 0 auto 1rem;
            display: block;
        }
        .maintenance-eyebrow {
            display: inline-block;
            background: var(--amber-light);
            color: #92400e;
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            padding: 0.35rem 0.85rem;
            border-radius: 999px;
            margin-bottom: 0.75rem;
        }
        .maintenance-title {
            font-size: 1.75rem;
            font-weight: 800;
            color: var(--primary);
            margin: 0 0 0.6rem;
            line-height: 1.15;
        }
        .maintenance-message {
            font-size: 1rem;
            color: var(--muted);
            line-height: 1.55;
            margin: 0 0 1.5rem;
        }
        .maintenance-retry {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #fff7ed;
            border: 1px solid #fdba74;
            color: #9a3412;
            font-size: 0.85rem;
            font-weight: 600;
            border-radius: 999px;
            padding: 0.4rem 0.85rem;
            margin: 0 0 1.5rem;
        }
        .maintenance-actions {
            display: grid;
            gap: 10px;
            margin-bottom: 1.5rem;
        }
        .maintenance-actions a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-height: 48px;
            padding: 0.75rem 1.25rem;
            border-radius: 12px;
            font-weight: 700;
            text-decoration: none;
            font-size: 0.95rem;
        }
        .maintenance-actions .btn-primary {
            background: var(--primary);
            color: #ffffff;
        }
        .maintenance-actions .btn-secondary {
            background: #ffffff;
            color: var(--dark);
            border: 1px solid var(--border);
        }
        .maintenance-info {
            border-top: 1px solid var(--border);
            padding-top: 1.25rem;
            font-size: 0.85rem;
            color: var(--muted);
            line-height: 1.55;
        }
        .maintenance-info strong { color: var(--dark); }
        .maintenance-social {
            display: flex;
            justify-content: center;
            gap: 12px;
            margin-top: 0.75rem;
        }
        .maintenance-social a {
            color: var(--primary);
            font-weight: 600;
            font-size: 0.85rem;
            text-decoration: none;
        }
        .maintenance-social a:hover { text-decoration: underline; }
        @media (max-width: 480px) {
            .maintenance-card { padding: 1.5rem 1.25rem; }
            .maintenance-title { font-size: 1.4rem; }
        }
    </style>
</head>
<body>
    <main class="maintenance-shell" role="main">
        <div class="maintenance-card">
            <img src="{{ $logoUrl }}" alt="{{ e($siteName) }}" class="maintenance-logo">
            <span class="maintenance-eyebrow">We&rsquo;ll be right back</span>
            <h1 class="maintenance-title">Our website is briefly down for maintenance.</h1>
            <p class="maintenance-message">{{ $message }}</p>

            @if($retryAt)
                <div class="maintenance-retry" aria-live="polite">
                    <span>Expected back around</span>
                    <strong>{{ \Illuminate\Support\Carbon::parse($retryAt)->timezone(config('app.timezone'))->format('D, M j · g:i A') }}</strong>
                </div>
            @endif

            <div class="maintenance-actions">
                <a href="{{ $phoneTel }}" class="btn-primary">Call the café · {{ $phone }}</a>
                @if($waLink)
                    <a href="{{ $waLink }}" class="btn-secondary" rel="noopener">WhatsApp us</a>
                @endif
            </div>

            <div class="maintenance-info">
                <p><strong>{{ $siteName }}</strong><br>
                    {{ $address }}<br>
                    <a href="mailto:{{ $email }}" style="color:var(--primary);text-decoration:none;">{{ $email }}</a>
                </p>
                @if($hoursSetting && is_string($hoursSetting))
                    <p style="margin-top:0.5rem;">{{ $hoursSetting }}</p>
                @endif
                <div class="maintenance-social">
                    @if($fbUrl)<a href="{{ $fbUrl }}" rel="noopener">Facebook</a>@endif
                    @if($igUrl)<a href="{{ $igUrl }}" rel="noopener">Instagram</a>@endif
                    @if($tiktokUrl)<a href="{{ $tiktokUrl }}" rel="noopener">TikTok</a>@endif
                </div>
            </div>
        </div>
    </main>
</body>
</html>
