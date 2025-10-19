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
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Montserrat', sans-serif;
            background: linear-gradient(135deg, #f5f1e8 0%, #fef9f0 50%, #f8f4eb 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }
        
        /* Subtle pattern overlay */
        body::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: 
                repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(139, 69, 19, 0.02) 2px, rgba(139, 69, 19, 0.02) 4px);
            pointer-events: none;
        }
        
        .container {
            text-align: center;
            max-width: 900px;
            padding: 2rem;
            position: relative;
            z-index: 2;
        }
        
        /* Tea Cup Illustration */
        .teacup-container {
            position: relative;
            width: 100%;
            max-width: 500px;
            margin: 0 auto 3rem;
            animation: float 3s ease-in-out infinite;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-15px); }
        }
        
        .teacup-svg {
            width: 100%;
            height: auto;
            filter: drop-shadow(0 20px 40px rgba(139, 69, 19, 0.15));
        }
        
        /* Steam animation */
        .steam {
            position: absolute;
            top: -30px;
            left: 50%;
            transform: translateX(-50%);
            width: 60px;
            height: 80px;
        }
        
        .steam-line {
            position: absolute;
            width: 4px;
            height: 40px;
            background: linear-gradient(to top, rgba(241, 97, 16, 0.3), transparent);
            border-radius: 50%;
            animation: steam-rise 3s ease-in-out infinite;
        }
        
        .steam-line:nth-child(1) {
            left: 15px;
            animation-delay: 0s;
        }
        
        .steam-line:nth-child(2) {
            left: 28px;
            animation-delay: 0.5s;
        }
        
        .steam-line:nth-child(3) {
            left: 41px;
            animation-delay: 1s;
        }
        
        @keyframes steam-rise {
            0% {
                opacity: 0;
                transform: translateY(0) scale(1);
            }
            50% {
                opacity: 0.6;
            }
            100% {
                opacity: 0;
                transform: translateY(-40px) scale(1.5);
            }
        }
        
        /* Brand */
        .brand-name {
            font-family: 'Cormorant Garamond', serif;
            font-size: 4rem;
            font-weight: 700;
            color: #6b4423;
            margin-bottom: 1rem;
            letter-spacing: 2px;
            text-shadow: 2px 2px 4px rgba(139, 69, 19, 0.1);
        }
        
        .dhivehi-text {
            font-size: 2.5rem;
            font-weight: 600;
            color: #f16110;
            margin-bottom: 2rem;
            direction: rtl;
            font-family: 'Times New Roman', serif;
        }
        
        .tagline {
            font-size: 1.3rem;
            color: #8b6f47;
            font-weight: 300;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin-bottom: 3rem;
        }
        
        .opening-soon {
            display: inline-block;
            padding: 1.2rem 3rem;
            background: rgba(241, 97, 16, 0.1);
            border: 2px solid #f16110;
            border-radius: 50px;
            font-size: 1.2rem;
            font-weight: 600;
            color: #f16110;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-bottom: 3rem;
            box-shadow: 0 10px 30px rgba(241, 97, 16, 0.15);
        }
        
        /* Contact */
        .contact {
            margin-top: 4rem;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.6);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 30px rgba(139, 69, 19, 0.1);
        }
        
        .contact-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.8rem;
            color: #6b4423;
            margin-bottom: 1.5rem;
            font-weight: 600;
        }
        
        .contact-items {
            display: flex;
            justify-content: center;
            gap: 3rem;
            flex-wrap: wrap;
        }
        
        .contact-item {
            display: flex;
            align-items: center;
            gap: 0.8rem;
            color: #8b6f47;
            font-size: 1rem;
        }
        
        .contact-item svg {
            width: 20px;
            height: 20px;
            fill: #f16110;
        }
        
        .contact-item a {
            color: #8b6f47;
            text-decoration: none;
            transition: color 0.3s ease;
        }
        
        .contact-item a:hover {
            color: #f16110;
        }
        
        /* Decorative elements */
        .corner-decoration {
            position: absolute;
            width: 150px;
            height: 150px;
            opacity: 0.05;
        }
        
        .corner-decoration.top-left {
            top: 20px;
            left: 20px;
            transform: rotate(0deg);
        }
        
        .corner-decoration.bottom-right {
            bottom: 20px;
            right: 20px;
            transform: rotate(180deg);
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .brand-name {
                font-size: 2.5rem;
            }
            
            .dhivehi-text {
                font-size: 1.8rem;
            }
            
            .tagline {
                font-size: 1rem;
            }
            
            .teacup-container {
                max-width: 350px;
            }
            
            .contact-items {
                flex-direction: column;
                gap: 1.5rem;
            }
        }
    </style>
</head>
<body>
    <!-- Decorative corner elements -->
    <svg class="corner-decoration top-left" viewBox="0 0 100 100">
        <circle cx="10" cy="10" r="2" fill="#8b6f47"/>
        <circle cx="30" cy="15" r="1.5" fill="#8b6f47"/>
        <circle cx="20" cy="35" r="2" fill="#8b6f47"/>
        <circle cx="45" cy="25" r="1" fill="#8b6f47"/>
    </svg>
    
    <svg class="corner-decoration bottom-right" viewBox="0 0 100 100">
        <circle cx="10" cy="10" r="2" fill="#8b6f47"/>
        <circle cx="30" cy="15" r="1.5" fill="#8b6f47"/>
        <circle cx="20" cy="35" r="2" fill="#8b6f47"/>
        <circle cx="45" cy="25" r="1" fill="#8b6f47"/>
    </svg>
    
    <div class="container">
        <!-- Tea Cup Illustration -->
        <div class="teacup-container">
            <!-- Steam -->
            <div class="steam">
                <div class="steam-line"></div>
                <div class="steam-line"></div>
                <div class="steam-line"></div>
            </div>
            
            <!-- Tea Cup SVG -->
            <svg class="teacup-svg" viewBox="0 0 400 350" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Saucer -->
                <ellipse cx="200" cy="310" rx="140" ry="20" fill="#d4a574" opacity="0.6"/>
                <ellipse cx="200" cy="308" rx="130" ry="18" fill="#e6c299"/>
                
                <!-- Cup Body -->
                <path d="M120 180 L90 280 Q90 290 100 295 L300 295 Q310 290 310 280 L280 180 Z" 
                      fill="url(#cupGradient)" stroke="#b8956a" stroke-width="2"/>
                
                <!-- Cup Inner Highlight -->
                <path d="M130 185 L105 270 Q105 278 112 282 L288 282 Q295 278 295 270 L270 185 Z" 
                      fill="#fff" opacity="0.15"/>
                
                <!-- Tea Liquid -->
                <ellipse cx="200" cy="180" rx="80" ry="25" fill="#8b4513" opacity="0.7"/>
                <ellipse cx="200" cy="178" rx="75" ry="23" fill="#a0522d" opacity="0.8"/>
                <ellipse cx="200" cy="176" rx="70" ry="20" fill="#cd853f"/>
                
                <!-- Cup Handle -->
                <path d="M290 200 Q340 200 350 240 Q340 280 290 280" 
                      fill="none" stroke="#b8956a" stroke-width="12" stroke-linecap="round"/>
                <path d="M290 205 Q335 205 343 240 Q335 275 290 275" 
                      fill="none" stroke="#d4a574" stroke-width="8" stroke-linecap="round"/>
                
                <!-- Highlights on cup -->
                <path d="M140 190 L125 250" stroke="#fff" stroke-width="3" opacity="0.4" stroke-linecap="round"/>
                <path d="M155 195 L135 265" stroke="#fff" stroke-width="2" opacity="0.3" stroke-linecap="round"/>
                
                <!-- Shadow under cup -->
                <ellipse cx="200" cy="295" rx="110" ry="8" fill="#000" opacity="0.1"/>
                
                <!-- Decorative pattern on cup -->
                <line x1="110" y1="240" x2="290" y2="240" stroke="#b8956a" stroke-width="1.5" opacity="0.4"/>
                <circle cx="150" cy="250" r="3" fill="#f16110" opacity="0.5"/>
                <circle cx="200" cy="253" r="3" fill="#f16110" opacity="0.5"/>
                <circle cx="250" cy="250" r="3" fill="#f16110" opacity="0.5"/>
                
                <!-- Gradients -->
                <defs>
                    <linearGradient id="cupGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#f5e6d3;stop-opacity:1" />
                        <stop offset="50%" style="stop-color:#e6c299;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#d4a574;stop-opacity:1" />
                    </linearGradient>
                </defs>
            </svg>
        </div>
        
        <!-- Brand Info -->
        <h1 class="brand-name">Bake & Grill</h1>
        <div class="dhivehi-text">އަސްލު ދިވެހި ރަހަ</div>
        <p class="tagline">Authentic Maldivian Flavors</p>
        
        <!-- Opening Soon Badge -->
        <div class="opening-soon">Opening Soon</div>
        
        <!-- Contact Information -->
        <div class="contact">
            <h2 class="contact-title">Stay Connected</h2>
            <div class="contact-items">
                <div class="contact-item">
                    <svg viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
                    </svg>
                    <span>Malé, Maldives</span>
                </div>
                <div class="contact-item">
                    <svg viewBox="0 0 20 20">
                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                    </svg>
                    <a href="mailto:contact@bakeandgrill.mv">contact@bakeandgrill.mv</a>
                </div>
                <div class="contact-item">
                    <svg viewBox="0 0 20 20">
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                    </svg>
                    <a href="tel:+9607000000">+960 700-0000</a>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
