<!DOCTYPE html>
<html>
<head>
    <title>Loading...</title>
    <style>
        body {
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-family: 'Poppins', sans-serif;
            background: linear-gradient(135deg, rgba(27, 163, 185, 0.08), rgba(184, 168, 144, 0.08));
        }
        .loader {
            text-align: center;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #e9ecef;
            border-top-color: #1ba3b9;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <p style="color: #636e72;">Loading your order...</p>
    </div>
    
    @if(session('customer_token'))
        <script>
            // Store token in localStorage for React app
            localStorage.setItem('online_token', '{{ session('customer_token') }}');
            // Redirect to order app
            setTimeout(() => {
                window.location.href = '/order?type={{ request('type', 'takeaway') }}';
            }, 500);
        </script>
    @else
        <script>
            // Not logged in, redirect to login
            window.location.href = '/customer/login';
        </script>
    @endif
</body>
</html>
