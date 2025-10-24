<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bake & Grill - Color Scheme 1: Warm Earth Tones</title>
    <meta name="description" content="Bake & Grill - Authentic Dhivehi Cuisine. Color Scheme 1: Warm Earth Tones.">
    
    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="Bake & Grill - Color Scheme 1: Warm Earth Tones">
    <meta property="og:description" content="Authentic Dhivehi Cuisine. Color Scheme 1: Warm Earth Tones.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://bakeandgrill.mv">
    <meta property="og:image" content="https://bakeandgrill.mv/logo.svg">
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="{{ asset('logo.svg') }}">
    
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        :root {
            --primary-color: #8B4513;
            --primary-dark: #654321;
            --secondary-color: #D2691E;
            --accent-color: #F4A460;
            --text-dark: #2F1B14;
            --text-light: #5D4037;
            --bg-gradient: linear-gradient(135deg, #FFF8DC 0%, #F5DEB3 50%, #DEB887 100%);
            --glass-bg: rgba(255, 248, 220, 0.25);
            --glass-border: rgba(255, 248, 220, 0.18);
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background: var(--bg-gradient);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow-x: hidden;
            position: relative;
        }
        
        /* Color Scheme Navigation */
        .color-nav {
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 1000;
            background: rgba(255, 255, 255, 0.9);
            padding: 15px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .color-nav h3 {
            font-size: 14px;
            color: var(--text-dark);
            margin-bottom: 10px;
            font-weight: 600;
        }
        
        .color-nav a {
            display: inline-block;
            padding: 5px 10px;
            margin: 2px;
            background: var(--primary-color);
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-size: 12px;
            transition: all 0.3s ease;
        }
        
        .color-nav a:hover {
            background: var(--primary-dark);
            transform: scale(1.05);
        }
        
        .color-nav a.active {
            background: var(--accent-color);
            color: var(--text-dark);
        }
        
        /* Scheme Number Badge */
        .scheme-badge {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            background: var(--primary-color);
            color: white;
            padding: 10px 15px;
            border-radius: 25px;
            font-weight: 600;
            font-size: 14px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        
        /* Animated Background Elements */
        .bg-decoration {
            position: absolute;
            width: 200px;
            height: 200px;
            border-radius: 50%;
            background: linear-gradient(45deg, var(--primary-color), var(--secondary-color));
            opacity: 0.1;
            animation: float 6s ease-in-out infinite;
        }
        
        .bg-decoration:nth-child(1) {
            top: 10%;
            left: 10%;
            animation-delay: 0s;
        }
        
        .bg-decoration:nth-child(2) {
            top: 20%;
            right: 15%;
            animation-delay: 2s;
            width: 150px;
            height: 150px;
        }
        
        .bg-decoration:nth-child(3) {
            bottom: 20%;
            left: 20%;
            animation-delay: 4s;
            width: 180px;
            height: 180px;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(180deg); }
        }
        
        /* Main Container */
        .container {
            max-width: 1200px;
            width: 100%;
            padding: 2rem;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4rem;
            align-items: center;
            position: relative;
            z-index: 10;
        }
        
        /* Left Side - Content */
        .content-side {
            text-align: left;
            animation: slideInLeft 1s ease-out;
        }
        
        .logo-section {
            margin-bottom: 2rem;
        }
        
        .logo {
            width: 180px;
            height: 180px;
            background: white;
            border-radius: 25px;
            padding: 25px;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
            margin-bottom: 3rem;
            animation: pulse 2s infinite;
            transition: transform 0.3s ease;
        }
        
        .logo:hover {
            transform: scale(1.05);
        }
        
        .logo svg, .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
        }
        
        .brand-name {
            font-family: 'Playfair Display', serif;
            font-size: 4.5rem;
            font-weight: 800;
            color: var(--text-dark);
            line-height: 1.1;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .dhivehi-text {
            font-size: 2.2rem;
            font-weight: 600;
            color: var(--primary-dark);
            margin-bottom: 1.5rem;
            direction: rtl;
            font-family: 'A_Faruwa', 'Arial Unicode MS', 'Times New Roman', serif;
            text-align: center;
        }
        
        .opening-badge {
            display: inline-block;
            padding: 1rem 2rem;
            background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
            color: white;
            border-radius: 50px;
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 3rem;
            box-shadow: 0 10px 30px rgba(139, 69, 19, 0.3);
            animation: bounce 2s infinite;
        }
        
        .tagline {
            font-size: 1.3rem;
            color: var(--text-light);
            margin-bottom: 3rem;
            line-height: 1.6;
        }
        
        .color-info {
            background: var(--glass-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--glass-border);
            border-radius: 15px;
            padding: 20px;
            margin-top: 2rem;
        }
        
        .color-info h4 {
            color: var(--text-dark);
            margin-bottom: 15px;
            font-size: 1.2rem;
        }
        
        .color-palette {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        
        .color-swatch {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            border: 2px solid white;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .color-names {
            font-size: 0.9rem;
            color: var(--text-light);
            line-height: 1.4;
        }
        
        /* Right Side - Image */
        .image-side {
            position: relative;
            animation: slideInRight 1s ease-out;
        }
        
        .image-container {
            position: relative;
            border-radius: 30px;
            overflow: hidden;
            box-shadow: 0 30px 60px rgba(0, 0, 0, 0.2);
            transform: perspective(1000px) rotateY(-5deg) rotateX(5deg);
            transition: transform 0.3s ease;
        }
        
        .image-container:hover {
            transform: perspective(1000px) rotateY(0deg) rotateX(0deg);
        }
        
        .hero-image {
            width: 100%;
            height: 600px;
            object-fit: cover;
            transition: transform 0.3s ease;
            display: block;
            background-color: #f3f4f6;
        }
        
        .hero-image:not([src]) {
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
        }
        
        .image-container:hover .hero-image {
            transform: scale(1.05);
        }
        
        /* Floating Elements */
        .floating-element {
            position: absolute;
            background: white;
            border-radius: 15px;
            padding: 1rem;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            animation: floatElement 3s ease-in-out infinite;
        }
        
        .floating-element:nth-child(1) {
            top: 10%;
            right: -10%;
            animation-delay: 1s;
        }
        
        .floating-element:nth-child(2) {
            bottom: 20%;
            left: -15%;
            animation-delay: 2s;
        }
        
        @keyframes floatElement {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-15px); }
        }
        
        /* Animations */
        @keyframes slideInLeft {
            from {
                opacity: 0;
                transform: translateX(-50px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        @keyframes slideInRight {
            from {
                opacity: 0;
                transform: translateX(50px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        
        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-10px); }
            60% { transform: translateY(-5px); }
        }
        
        /* Responsive Design */
        @media (max-width: 968px) {
            .container {
                grid-template-columns: 1fr;
                gap: 3rem;
                text-align: center;
            }
            
            .content-side {
                text-align: center;
            }
            
            .brand-name {
                font-size: 3.5rem;
            }
            
            .dhivehi-text {
                font-size: 1.8rem;
            }
            
            .hero-image {
                height: 400px;
            }
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }
            
            .brand-name {
                font-size: 2.8rem;
            }
            
            .dhivehi-text {
                font-size: 1.5rem;
            }
            
            .hero-image {
                height: 300px;
            }
            
            .floating-element {
                display: none;
            }
            
            .color-nav {
                position: relative;
                top: auto;
                left: auto;
                margin-bottom: 20px;
            }
            
            .scheme-badge {
                position: relative;
                top: auto;
                right: auto;
                display: inline-block;
                margin-bottom: 20px;
            }
        }
    </style>
</head>
<body>
    <!-- Color Scheme Navigation -->
    <div class="color-nav">
        <h3>Color Schemes</h3>
        <a href="{{ route('color-scheme-1') }}" class="active">1. Warm Earth</a>
        <a href="{{ route('color-scheme-2') }}">2. Sage & Terracotta</a>
        <a href="{{ route('color-scheme-3') }}">3. Charcoal & Gold</a>
        <a href="{{ route('color-scheme-4') }}">4. Burnt Orange & Navy</a>
        <a href="{{ route('color-scheme-5') }}">5. Forest & Cream</a>
        <a href="{{ route('color-scheme-6') }}">6. Warm Gray & Copper</a>
        <a href="{{ route('color-scheme-7') }}">7. Deep Teal & Mustard</a>
        <a href="{{ route('home') }}">Original</a>
    </div>
    
    <!-- Scheme Number Badge -->
    <div class="scheme-badge">Scheme #1</div>
    
    <!-- Background Decorations -->
    <div class="bg-decoration"></div>
    <div class="bg-decoration"></div>
    <div class="bg-decoration"></div>
    
    <div class="container">
        <!-- Left Side - Content -->
        <div class="content-side">
            <div class="logo-section">
                <div class="logo">
                    <svg width="150" height="150" viewBox="0 0 150 150" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <!-- Background -->
                        <defs>
                            <radialGradient id="bgGradient" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" style="stop-color:#D2691E;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#8B4513;stop-opacity:1" />
                            </radialGradient>
                            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#F4A460;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#D2691E;stop-opacity:1" />
                            </linearGradient>
                        </defs>
                        
                        <!-- Main Circle -->
                        <circle cx="75" cy="75" r="70" fill="url(#bgGradient)" stroke="#654321" stroke-width="3"/>
                        
                        <!-- Chef's Hat (Top) -->
                        <path d="M45 45 L75 35 L105 45 L105 55 L45 55 Z" fill="white" stroke="#e5e7eb" stroke-width="1"/>
                        <ellipse cx="75" cy="40" rx="30" ry="8" fill="white"/>
                        
                        <!-- Grill Plate (Center) -->
                        <ellipse cx="75" cy="75" rx="35" ry="20" fill="url(#logoGradient)" stroke="#8B4513" stroke-width="2"/>
                        
                        <!-- Grill Lines -->
                        <line x1="50" y1="70" x2="100" y2="70" stroke="#fff" stroke-width="2" opacity="0.8"/>
                        <line x1="50" y1="75" x2="100" y2="75" stroke="#fff" stroke-width="2" opacity="0.8"/>
                        <line x1="50" y1="80" x2="100" y2="80" stroke="#fff" stroke-width="2" opacity="0.8"/>
                        
                        <!-- Baking Oven (Bottom) -->
                        <rect x="40" y="85" width="70" height="25" rx="8" fill="#374151" stroke="#1f2937" stroke-width="2"/>
                        <rect x="45" y="90" width="60" height="15" rx="5" fill="#1f2937"/>
                        
                        <!-- Oven Handle -->
                        <circle cx="115" cy="97" r="6" fill="#6b7280" stroke="#374151" stroke-width="1"/>
                        
                        <!-- Bread Loaves -->
                        <ellipse cx="60" cy="35" rx="8" ry="5" fill="#F4A460" transform="rotate(-20 60 35)"/>
                        <ellipse cx="75" cy="32" rx="8" ry="5" fill="#F4A460" transform="rotate(0 75 32)"/>
                        <ellipse cx="90" cy="35" rx="8" ry="5" fill="#F4A460" transform="rotate(20 90 35)"/>
                        
                        <!-- Steam from Oven -->
                        <path d="M60 85 Q65 78 70 85" stroke="#fff" stroke-width="2" fill="none" opacity="0.7"/>
                        <path d="M75 85 Q80 75 85 85" stroke="#fff" stroke-width="2" fill="none" opacity="0.7"/>
                        <path d="M90 85 Q95 78 100 85" stroke="#fff" stroke-width="2" fill="none" opacity="0.7"/>
                        
                        <!-- Steam from Bread -->
                        <path d="M60 30 Q65 23 70 30" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.6"/>
                        <path d="M75 27 Q80 20 85 27" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.6"/>
                        <path d="M90 30 Q95 23 100 30" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.6"/>
                    </svg>
                </div>
            </div>
            
            <h1 class="brand-name">Bake & Grill</h1>
            <div class="dhivehi-text">އަސްލު ދިވެހި ރަހަ</div>
            
            <div class="opening-badge">Color Scheme 1</div>
            
            <p class="tagline">
                Experience the authentic flavors of traditional Dhivehi cuisine, 
                freshly baked goods, and expertly grilled specialties in the heart of Malé.
            </p>
            
            <div class="color-info">
                <h4>Warm Earth Tones</h4>
                <div class="color-palette">
                    <div class="color-swatch" style="background: #8B4513;"></div>
                    <div class="color-swatch" style="background: #D2691E;"></div>
                    <div class="color-swatch" style="background: #F4A460;"></div>
                    <div class="color-swatch" style="background: #FFF8DC;"></div>
                </div>
                <div class="color-names">
                    Primary: Saddle Brown (#8B4513)<br>
                    Secondary: Chocolate (#D2691E)<br>
                    Accent: Sandy Brown (#F4A460)<br>
                    Background: Cornsilk (#FFF8DC)
                </div>
            </div>
        </div>
        
        <!-- Right Side - Hero Image -->
        <div class="image-side">
            <div class="image-container">
                <img src="https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=800&auto=format&fit=crop&q=80" 
                     alt="Beautiful Tea Setup with Steam and Silver Tray" 
                     class="hero-image"
                     loading="eager"
                     onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1578934906274-f279666767f0?w=800&auto=format&fit=crop&q=80';">
            </div>
            
            <!-- Floating Elements -->
            <div class="floating-element">
                <div style="font-size: 0.9rem; color: var(--primary-color); font-weight: 600;">🍵 Fresh Tea</div>
            </div>
            <div class="floating-element">
                <div style="font-size: 0.9rem; color: var(--primary-color); font-weight: 600;">🥖 Daily Baked</div>
            </div>
        </div>
    </div>
</body>
</html>
