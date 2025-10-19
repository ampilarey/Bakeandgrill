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
    
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            overflow-x: hidden;
            position: relative;
        }
        
        /* Animated Background */
        .bg-animation {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            overflow: hidden;
        }
        
        .bg-gradient {
            position: absolute;
            width: 200%;
            height: 200%;
            top: -50%;
            left: -50%;
            background: radial-gradient(circle at 30% 50%, rgba(241, 97, 16, 0.15) 0%, transparent 50%),
                        radial-gradient(circle at 70% 50%, rgba(255, 107, 0, 0.12) 0%, transparent 50%),
                        radial-gradient(circle at 50% 80%, rgba(255, 140, 0, 0.1) 0%, transparent 50%);
            animation: rotate 30s linear infinite;
        }
        
        .particles {
            position: absolute;
            width: 100%;
            height: 100%;
        }
        
        .particle {
            position: absolute;
            border-radius: 50%;
            background: rgba(241, 97, 16, 0.3);
            animation: float-particle 20s infinite;
        }
        
        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        @keyframes float-particle {
            0%, 100% {
                transform: translateY(0) translateX(0);
                opacity: 0;
            }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% {
                transform: translateY(-100vh) translateX(50px);
                opacity: 0;
            }
        }
        
        .container {
            text-align: center;
            max-width: 1000px;
            padding: 3rem 2rem;
            position: relative;
            z-index: 2;
        }
        
        .brand-container {
            margin-bottom: 4rem;
        }
        
        .logo-wrapper {
            display: inline-block;
            position: relative;
            margin-bottom: 2rem;
        }
        
        .logo {
            width: 140px;
            height: 140px;
            background: linear-gradient(135deg, #f16110 0%, #ff6b00 100%);
            border-radius: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 30px 60px rgba(241, 97, 16, 0.4),
                        0 0 0 1px rgba(255, 255, 255, 0.1);
            animation: float 3s ease-in-out infinite;
            transform-style: preserve-3d;
            position: relative;
        }
        
        .logo::before {
            content: '';
            position: absolute;
            inset: -2px;
            border-radius: 30px;
            padding: 2px;
            background: linear-gradient(45deg, #f16110, #ff6b00, #ff8c00, #f16110);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            opacity: 0.5;
            animation: border-spin 3s linear infinite;
        }
        
        @keyframes border-spin {
            to { transform: rotate(360deg); }
        }
        
        .logo svg {
            width: 90px;
            height: 90px;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
        }
        
        .brand-name {
            font-family: 'Playfair Display', serif;
            font-size: 5rem;
            font-weight: 900;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #ffffff 0%, #f5f5f5 50%, #e0e0e0 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            letter-spacing: -2px;
            line-height: 1;
            text-shadow: 0 0 80px rgba(241, 97, 16, 0.5);
        }
        
        .brand-tagline {
            font-family: 'Playfair Display', serif;
            font-size: 1.5rem;
            color: #ff6b00;
            font-style: italic;
            font-weight: 600;
            letter-spacing: 1px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 1rem 2.5rem;
            background: rgba(255, 255, 255, 0.05);
            border: 2px solid rgba(241, 97, 16, 0.5);
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 3px;
            margin-bottom: 3rem;
            backdrop-filter: blur(10px);
            animation: pulse-border 2s ease-in-out infinite;
        }
        
        @keyframes pulse-border {
            0%, 100% {
                box-shadow: 0 0 20px rgba(241, 97, 16, 0.3), 0 0 40px rgba(241, 97, 16, 0.1);
            }
            50% {
                box-shadow: 0 0 40px rgba(241, 97, 16, 0.5), 0 0 80px rgba(241, 97, 16, 0.2);
            }
        }
        
        .dhivehi-section {
            margin: 4rem 0;
            padding: 3rem;
            background: linear-gradient(135deg, rgba(241, 97, 16, 0.1) 0%, rgba(255, 107, 0, 0.05) 100%);
            border-radius: 30px;
            border: 1px solid rgba(241, 97, 16, 0.2);
            backdrop-filter: blur(20px);
        }
        
        .dhivehi-text {
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 1rem;
            direction: rtl;
            text-align: center;
            background: linear-gradient(135deg, #ffffff 0%, #ffaa66 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            font-family: 'Times New Roman', serif;
            line-height: 1.4;
        }
        
        .subtitle {
            font-size: 1.1rem;
            color: rgba(255, 255, 255, 0.7);
            font-weight: 400;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
            margin: 4rem 0;
        }
        
        .feature-card {
            padding: 2rem;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
        }
        
        .feature-card:hover {
            background: rgba(241, 97, 16, 0.1);
            border-color: rgba(241, 97, 16, 0.3);
            transform: translateY(-5px);
        }
        
        .feature-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
            display: block;
        }
        
        .feature-title {
            font-family: 'Playfair Display', serif;
            font-size: 1.3rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: #ff6b00;
        }
        
        .feature-description {
            font-size: 0.95rem;
            color: rgba(255, 255, 255, 0.6);
            line-height: 1.6;
        }
        
        .countdown {
            display: flex;
            justify-content: center;
            gap: 2rem;
            margin: 4rem 0;
            flex-wrap: wrap;
        }
        
        .countdown-item {
            background: linear-gradient(135deg, rgba(241, 97, 16, 0.15) 0%, rgba(255, 107, 0, 0.1) 100%);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 2rem 1.5rem;
            min-width: 120px;
            border: 1px solid rgba(241, 97, 16, 0.3);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            transition: transform 0.3s ease;
        }
        
        .countdown-item:hover {
            transform: scale(1.05);
        }
        
        .countdown-number {
            font-family: 'Playfair Display', serif;
            font-size: 3rem;
            font-weight: 700;
            display: block;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #ffffff 0%, #ffaa66 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .countdown-label {
            font-size: 0.85rem;
            color: rgba(255, 255, 255, 0.7);
            text-transform: uppercase;
            letter-spacing: 2px;
            font-weight: 500;
        }
        
        .contact-section {
            margin-top: 5rem;
            padding: 3rem;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 30px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
        }
        
        .contact-title {
            font-family: 'Playfair Display', serif;
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 2rem;
            color: #ff6b00;
        }
        
        .contact-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
        }
        
        .contact-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1.5rem;
            background: rgba(241, 97, 16, 0.05);
            border-radius: 15px;
            transition: all 0.3s ease;
        }
        
        .contact-item:hover {
            background: rgba(241, 97, 16, 0.1);
            transform: translateX(5px);
        }
        
        .contact-icon-wrapper {
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #f16110 0%, #ff6b00 100%);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        
        .contact-icon {
            width: 24px;
            height: 24px;
            color: white;
        }
        
        .contact-details {
            text-align: left;
        }
        
        .contact-label {
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.5);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 0.25rem;
        }
        
        .contact-value {
            font-size: 1rem;
            color: white;
            font-weight: 500;
        }
        
        .contact-value a {
            color: white;
            text-decoration: none;
            transition: color 0.3s ease;
        }
        
        .contact-value a:hover {
            color: #ff6b00;
        }
        
        @keyframes float {
            0%, 100% {
                transform: translateY(0px);
            }
            50% {
                transform: translateY(-15px);
            }
        }
        
        /* Responsive Design */
        @media (max-width: 768px) {
            .container {
                padding: 2rem 1rem;
            }
            
            .brand-name {
                font-size: 3rem;
            }
            
            .brand-tagline {
                font-size: 1.1rem;
            }
            
            .dhivehi-text {
                font-size: 2rem;
            }
            
            .countdown {
                gap: 1rem;
            }
            
            .countdown-item {
                min-width: 90px;
                padding: 1.5rem 1rem;
            }
            
            .countdown-number {
                font-size: 2rem;
            }
            
            .logo {
                width: 110px;
                height: 110px;
            }
            
            .logo svg {
                width: 70px;
                height: 70px;
            }
            
            .features {
                grid-template-columns: 1fr;
                gap: 1.5rem;
            }
            
            .contact-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <!-- Animated Background -->
    <div class="bg-animation">
        <div class="bg-gradient"></div>
        <div class="particles" id="particles"></div>
    </div>
    
    <div class="container">
        <!-- Brand Section -->
        <div class="brand-container">
            <div class="logo-wrapper">
                <div class="logo">
                    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <!-- Oven/Bake symbol -->
                        <rect x="4" y="8" width="24" height="18" rx="2" fill="white" stroke="#f5f5f5" stroke-width="1"/>
                        <!-- Fire/Grill symbol -->
                        <circle cx="16" cy="6" r="4" fill="white"/>
                        <path d="M12 4.5C12.5 3.5 14 3.5 14.5 4.5C15 5.5 14 7 13 7S12 6.5 12 4.5Z" fill="#f5f5f5"/>
                        <path d="M20 4.5C19.5 3.5 18 3.5 17.5 4.5C17 5.5 18 7 19 7S20 6.5 20 4.5Z" fill="#f5f5f5"/>
                        <!-- Interior details -->
                        <rect x="8" y="12" width="16" height="2" rx="1" fill="#d4d4d4"/>
                        <rect x="8" y="16" width="16" height="2" rx="1" fill="#d4d4d4"/>
                        <rect x="8" y="20" width="12" height="2" rx="1" fill="#d4d4d4"/>
                        <!-- Handle -->
                        <rect x="26" y="14" width="3" height="6" rx="1" fill="#999"/>
                    </svg>
                </div>
            </div>
            <h1 class="brand-name">Bake & Grill</h1>
            <p class="brand-tagline">Authentic Maldivian Flavors</p>
        </div>
        
        <!-- Status Badge -->
        <div class="status-badge">Opening Soon</div>
        
        <!-- Dhivehi Section -->
        <div class="dhivehi-section">
            <div class="dhivehi-text">އަސްލު ދިވެހި ރަހަ</div>
            <p class="subtitle">Where Tradition Meets Taste</p>
        </div>
        
        <!-- Features -->
        <div class="features">
            <div class="feature-card">
                <span class="feature-icon">🔥</span>
                <h3 class="feature-title">Traditional Grilling</h3>
                <p class="feature-description">Authentic cooking methods passed down through generations</p>
            </div>
            <div class="feature-card">
                <span class="feature-icon">🥖</span>
                <h3 class="feature-title">Fresh Baked Daily</h3>
                <p class="feature-description">Artisanal breads and pastries made fresh every morning</p>
            </div>
            <div class="feature-card">
                <span class="feature-icon">🌴</span>
                <h3 class="feature-title">Local Ingredients</h3>
                <p class="feature-description">Sourced from the finest local and regional suppliers</p>
            </div>
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
        
        <!-- Contact Section -->
        <div class="contact-section">
            <h2 class="contact-title">Get in Touch</h2>
            <div class="contact-grid">
                <div class="contact-item">
                    <div class="contact-icon-wrapper">
                        <svg class="contact-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="contact-details">
                        <div class="contact-label">Location</div>
                        <div class="contact-value">Malé, Maldives</div>
                    </div>
                </div>
                <div class="contact-item">
                    <div class="contact-icon-wrapper">
                        <svg class="contact-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                        </svg>
                    </div>
                    <div class="contact-details">
                        <div class="contact-label">Email</div>
                        <div class="contact-value"><a href="mailto:contact@bakeandgrill.mv">contact@bakeandgrill.mv</a></div>
                    </div>
                </div>
                <div class="contact-item">
                    <div class="contact-icon-wrapper">
                        <svg class="contact-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                        </svg>
                    </div>
                    <div class="contact-details">
                        <div class="contact-label">Phone</div>
                        <div class="contact-value"><a href="tel:+9607000000">+960 700-0000</a></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Create floating particles
        function createParticles() {
            const particlesContainer = document.getElementById('particles');
            const particleCount = 15;
            
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.width = (Math.random() * 4 + 2) + 'px';
                particle.style.height = particle.style.width;
                particle.style.animationDuration = (Math.random() * 10 + 15) + 's';
                particle.style.animationDelay = (Math.random() * 5) + 's';
                particlesContainer.appendChild(particle);
            }
        }
        
        createParticles();
        
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
