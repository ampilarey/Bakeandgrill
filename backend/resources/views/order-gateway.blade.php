@php
    $siteName = content('site_name', 'Bake & Grill');
    $logoUrl  = content('logo', asset('logo.png'));
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading — {{ $siteName }}</title>
    <link rel="icon" type="image/png" href="{{ content('favicon', $logoUrl) }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #FFFDF9;
            color: #2A1E0C;
            -webkit-font-smoothing: antialiased;
        }
        .loader { text-align: center; padding: 1.5rem; }
        .brand {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.6rem;
            margin-bottom: 1.25rem;
            font-weight: 800;
            font-size: 1.1rem;
            color: #1C1408;
        }
        .brand img { width: 40px; height: 40px; border-radius: 9px; object-fit: cover; }
        .spinner {
            width: 44px;
            height: 44px;
            border: 3px solid #EDE4D4;
            border-top-color: #D4813A;
            border-radius: 50%;
            animation: spin 0.85s linear infinite;
            margin: 0 auto 1rem;
        }
        .loader p { color: #8B7355; font-size: 0.95rem; font-weight: 500; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="loader">
        <div class="brand">
            <img src="{{ $logoUrl }}" alt="">
            <span>{{ $siteName }}</span>
        </div>
        <div class="spinner"></div>
        <p>Loading your order...</p>
    </div>

    @if(session('customer_token'))
        <script nonce="{{ csp_nonce() }}">
            localStorage.setItem('online_token', '{{ session('customer_token') }}');
            setTimeout(function () {
                window.location.href = '/order?type={{ request('type', 'takeaway') }}';
            }, 500);
        </script>
    @else
        <script nonce="{{ csp_nonce() }}">
            window.location.href = '/customer/login';
        </script>
    @endif
</body>
</html>
