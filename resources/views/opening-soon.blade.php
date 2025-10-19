<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bake & Grill - Opening Soon</title>
    <meta name="description" content="Bake & Grill - Authentic Dhivehi Cuisine. Opening Soon in the Maldives.">
    
    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="Bake & Grill - Opening Soon">
    <meta property="og:description" content="Authentic Dhivehi Cuisine. Opening Soon in the Maldives.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://bakeandgrill.mv">
    <meta property="og:image" content="https://bakeandgrill.mv/logo.svg">
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="{{ asset('logo.svg') }}">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #f16110 0%, #ff6b00 50%, #ff8c00 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            overflow-x: hidden;
        }
        
        .container {
            text-align: center;
            max-width: 800px;
            padding: 2rem;
            position: relative;
            z-index: 2;
        }
        
        .logo {
            width: 120px;
            height: 120px;
            margin: 0 auto 3rem;
            background: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            animation: float 3s ease-in-out infinite;
        }
        
        .logo svg {
            width: 80px;
            height: 80px;
        }
        
        h1 {
            font-size: 3.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            letter-spacing: -1px;
        }
        
        .dhivehi-text {
            font-size: 2rem;
            font-weight: 500;
            margin-bottom: 3rem;
            opacity: 0.95;
            font-family: 'Times New Roman', serif;
            direction: rtl;
            text-align: center;
        }
        
        .subtitle {
            font-size: 1.2rem;
            opacity: 0.9;
            margin-bottom: 3rem;
            font-weight: 300;
        }
        
        .countdown {
            display: flex;
            justify-content: center;
            gap: 2rem;
            margin: 3rem 0;
            flex-wrap: wrap;
        }
        
        .countdown-item {
            background: rgba(255,255,255,0.15);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 1.5rem 1rem;
            min-width: 100px;
            border: 1px solid rgba(255,255,255,0.2);
        }
        
        .countdown-number {
            font-size: 2rem;
            font-weight: 700;
            display: block;
            margin-bottom: 0.5rem;
        }
        
        .countdown-label {
            font-size: 0.9rem;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .contact-info {
            margin-top: 4rem;
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
        }
        
        .contact-item {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            margin: 1rem 0;
            font-size: 1.1rem;
        }
        
        .contact-item a {
            color: white;
            text-decoration: none;
            transition: opacity 0.3s ease;
        }
        
        .contact-item a:hover {
            opacity: 0.8;
        }
        
        .contact-icon {
            width: 24px;
            height: 24px;
        }
        
        /* Floating Elements */
        .floating-element {
            position: absolute;
            opacity: 0.1;
            animation: float 6s ease-in-out infinite;
        }
        
        .floating-element:nth-child(1) {
            top: 10%;
            left: 10%;
            animation-delay: 0s;
        }
        
        .floating-element:nth-child(2) {
            top: 20%;
            right: 15%;
            animation-delay: 2s;
        }
        
        .floating-element:nth-child(3) {
            bottom: 20%;
            left: 20%;
            animation-delay: 4s;
        }
        
        .floating-element:nth-child(4) {
            bottom: 10%;
            right: 10%;
            animation-delay: 1s;
        }
        
        @keyframes float {
            0%, 100% {
                transform: translateY(0px);
            }
            50% {
                transform: translateY(-20px);
            }
        }
        
        /* Responsive Design */
        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }
            
            h1 {
                font-size: 2.5rem;
            }
            
            .dhivehi-text {
                font-size: 1.5rem;
            }
            
            .countdown {
                gap: 1rem;
            }
            
            .countdown-item {
                min-width: 80px;
                padding: 1rem 0.5rem;
            }
            
            .countdown-number {
                font-size: 1.5rem;
            }
            
            .logo {
                width: 100px;
                height: 100px;
                margin-bottom: 2rem;
            }
            
            .logo svg {
                width: 60px;
                height: 60px;
            }
        }
    </style>
</head>
<body>
    <!-- Floating Background Elements -->
    <div class="floating-element">🍞</div>
    <div class="floating-element">🔥</div>
    <div class="floating-element">🥖</div>
    <div class="floating-element">🧈</div>
    
    <div class="container">
        <!-- Logo -->
        <div class="logo">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Oven/Bake symbol -->
                <rect x="4" y="8" width="24" height="18" rx="2" fill="#f16110" stroke="#d4520e" stroke-width="1"/>
                <!-- Fire/Grill symbol -->
                <circle cx="16" cy="6" r="4" fill="#ff6b00"/>
                <path d="M12 4.5C12.5 3.5 14 3.5 14.5 4.5C15 5.5 14 7 13 7S12 6.5 12 4.5Z" fill="#ffaa00"/>
                <path d="M20 4.5C19.5 3.5 18 3.5 17.5 4.5C17 5.5 18 7 19 7S20 6.5 20 4.5Z" fill="#ffaa00"/>
                <!-- Interior details -->
                <rect x="8" y="12" width="16" height="2" rx="1" fill="#d4520e"/>
                <rect x="8" y="16" width="16" height="2" rx="1" fill="#d4520e"/>
                <rect x="8" y="20" width="12" height="2" rx="1" fill="#d4520e"/>
                <!-- Handle -->
                <rect x="26" y="14" width="3" height="6" rx="1" fill="#8b4513"/>
            </svg>
        </div>
        
        <!-- Main Heading -->
        <h1>Opening Soon</h1>
        
        <!-- Dhivehi Text -->
        <div class="dhivehi-text">އަސްލު ދިވެހި ރަހަ</div>
        
        <!-- Subtitle -->
        <div class="subtitle">
            Authentic Dhivehi Cuisine • Fresh Baked Goods • Traditional Grilling
        </div>
        
        <!-- Countdown Timer -->
        <div class="countdown" id="countdown">
            <div class="countdown-item">
                <span class="countdown-number" id="days">--</span>
                <span class="countdown-label">Days</span>
            </div>
            <div class="countdown-item">
                <span class="countdown-number" id="hours">--</span>
                <span class="countdown-label">Hours</span>
            </div>
            <div class="countdown-item">
                <span class="countdown-number" id="minutes">--</span>
                <span class="countdown-label">Minutes</span>
            </div>
            <div class="countdown-item">
                <span class="countdown-number" id="seconds">--</span>
                <span class="countdown-label">Seconds</span>
            </div>
        </div>
        
        <!-- Contact Information -->
        <div class="contact-info">
            <div class="contact-item">
                <svg class="contact-icon" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
                </svg>
                <span>Malé, Republic of Maldives</span>
            </div>
            <div class="contact-item">
                <svg class="contact-icon" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                </svg>
                <a href="mailto:contact@bakeandgrill.mv">contact@bakeandgrill.mv</a>
            </div>
            <div class="contact-item">
                <svg class="contact-icon" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                </svg>
                <a href="tel:+9607000000">+960 700-0000</a>
            </div>
        </div>
    </div>

    <script>
        // Countdown timer - Update this date to your actual opening date
        const openingDate = new Date('2025-03-01T00:00:00').getTime();
        
        function updateCountdown() {
            const now = new Date().getTime();
            const timeLeft = openingDate - now;
            
            if (timeLeft > 0) {
                const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
                
                document.getElementById('days').innerHTML = days.toString().padStart(2, '0');
                document.getElementById('hours').innerHTML = hours.toString().padStart(2, '0');
                document.getElementById('minutes').innerHTML = minutes.toString().padStart(2, '0');
                document.getElementById('seconds').innerHTML = seconds.toString().padStart(2, '0');
            } else {
                // Countdown finished
                document.getElementById('countdown').innerHTML = '<div class="countdown-item"><span class="countdown-number">🎉</span><span class="countdown-label">We\'re Open!</span></div>';
            }
        }
        
        // Update countdown every second
        setInterval(updateCountdown, 1000);
        updateCountdown(); // Initial call
    </script>
</body>
</html>
