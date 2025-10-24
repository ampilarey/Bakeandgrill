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
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        :root {
            --primary-color: #DAA520;
            --primary-dark: #B8860B;
            --secondary-color: #2C3E50;
            --accent-color: #F4D03F;
            --text-dark: #DAA520;
            --text-light: #F0E68C;
            --bg-gradient: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #0f0f0f 100%);
            --glass-bg: rgba(218, 165, 32, 0.1);
            --glass-border: rgba(218, 165, 32, 0.3);
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background: #0f0f0f;
            background-image: 
                radial-gradient(circle at 30% 20%, rgba(218, 165, 32, 0.1) 0%, transparent 40%),
                radial-gradient(circle at 70% 80%, rgba(218, 165, 32, 0.08) 0%, transparent 40%),
                linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #0f0f0f 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow-x: hidden;
            position: relative;
        }
        
        
        .scheme-badge {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            background: var(--primary-color);
            color: var(--secondary-color);
            padding: 10px 15px;
            border-radius: 25px;
            font-weight: 600;
            font-size: 14px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        }
        
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
        
        .container {
            max-width: 1400px;
            width: 100%;
            padding: 3rem;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4rem;
            align-items: center;
            position: relative;
            z-index: 10;
        }
        
        @media (max-width: 968px) {
            .container {
                grid-template-columns: 1fr;
                gap: 3rem;
                text-align: center;
            }
        }
        
        .content-side {
            text-align: left;
            animation: slideInLeft 1s ease-out;
        }
        
        .visual-side {
            position: relative;
            animation: slideInRight 1s ease-out;
        }
        
        .modern-card {
            background: rgba(218, 165, 32, 0.05);
            border: 1px solid rgba(218, 165, 32, 0.2);
            border-radius: 20px;
            padding: 3rem;
            backdrop-filter: blur(10px);
            position: relative;
            overflow: hidden;
        }
        
        .modern-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, #DAA520, transparent);
        }
        
        .modern-card::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 2px;
            bottom: 0;
            background: linear-gradient(180deg, transparent, #DAA520, transparent);
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
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
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
            font-family: 'Inter', sans-serif;
            font-size: 4.5rem;
            font-weight: 300;
            color: var(--primary-color);
            line-height: 1.1;
            margin-bottom: 1rem;
            letter-spacing: 8px;
            text-transform: uppercase;
            position: relative;
        }
        
        .brand-name::after {
            content: '';
            position: absolute;
            bottom: -10px;
            left: 0;
            width: 60px;
            height: 2px;
            background: var(--primary-color);
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
            padding: 1rem 2.5rem;
            background: var(--primary-color);
            color: var(--secondary-color);
            border: none;
            border-radius: 50px;
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 3rem;
            text-transform: uppercase;
            letter-spacing: 2px;
            transition: all 0.3s ease;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }
        
        .opening-badge::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }
        
        .opening-badge:hover::before {
            left: 100%;
        }
        
        .opening-badge:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(218, 165, 32, 0.4);
        }
        
        .tagline {
            font-size: 1.1rem;
            color: var(--text-light);
            margin-bottom: 2rem;
            line-height: 1.6;
            font-weight: 400;
            letter-spacing: 1px;
            opacity: 0.9;
        }
        
        .opening-text {
            font-size: 1.8rem;
            color: var(--primary-color);
            margin-bottom: 2rem;
            font-weight: 300;
            letter-spacing: 3px;
            text-transform: uppercase;
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
            
            .floating-element {
                display: none;
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
    
    <!-- Scheme Number Badge -->
    <div class="scheme-badge">Main Page</div>
    
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
                                <stop offset="0%" style="stop-color:#DAA520;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#36454F;stop-opacity:1" />
                            </radialGradient>
                            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#F0E68C;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#DAA520;stop-opacity:1" />
                            </linearGradient>
                        </defs>
                        
                        <!-- Main Circle -->
                        <circle cx="75" cy="75" r="70" fill="url(#bgGradient)" stroke="#2C3E50" stroke-width="3"/>
                        
                        <!-- Chef's Hat (Top) -->
                        <path d="M45 45 L75 35 L105 45 L105 55 L45 55 Z" fill="white" stroke="#e5e7eb" stroke-width="1"/>
                        <ellipse cx="75" cy="40" rx="30" ry="8" fill="white"/>
                        
                        <!-- Grill Plate (Center) -->
                        <ellipse cx="75" cy="75" rx="35" ry="20" fill="url(#logoGradient)" stroke="#36454F" stroke-width="2"/>
                        
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
                        <ellipse cx="60" cy="35" rx="8" ry="5" fill="#F0E68C" transform="rotate(-20 60 35)"/>
                        <ellipse cx="75" cy="32" rx="8" ry="5" fill="#F0E68C" transform="rotate(0 75 32)"/>
                        <ellipse cx="90" cy="35" rx="8" ry="5" fill="#F0E68C" transform="rotate(20 90 35)"/>
                        
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
            
            <div class="opening-text">Opening Soon</div>
            
            <p class="tagline">
                Experience the authentic flavors of traditional Dhivehi cuisine, 
                freshly baked goods, and expertly grilled specialties in the heart of Malé.
            </p>
            
            <div class="opening-badge">Visit Us</div>
            
            <div class="color-info">
                <h4>Charcoal & Gold</h4>
                <div class="color-palette">
                    <div class="color-swatch" style="background: #36454F;"></div>
                    <div class="color-swatch" style="background: #DAA520;"></div>
                    <div class="color-swatch" style="background: #F0E68C;"></div>
                    <div class="color-swatch" style="background: #F8F8FF;"></div>
                </div>
                <div class="color-names">
                    Primary: Charcoal (#36454F)<br>
                    Secondary: Goldenrod (#DAA520)<br>
                    Accent: Khaki (#F0E68C)<br>
                    Background: Ghost White (#F8F8FF)
                </div>
            </div>
        </div>
        
        <!-- Modern Visual Side -->
        <div class="visual-side">
            <div class="modern-card">
                <h3 style="color: var(--primary-color); font-size: 1.5rem; margin-bottom: 2rem; font-weight: 300; letter-spacing: 2px;">PREMIUM DINING</h3>
                <div style="display: grid; gap: 1.5rem;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 40px; height: 40px; background: var(--primary-color); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--secondary-color); font-weight: bold;">1</div>
                        <span style="color: var(--text-light);">Authentic Dhivehi Cuisine</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 40px; height: 40px; background: var(--primary-color); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--secondary-color); font-weight: bold;">2</div>
                        <span style="color: var(--text-light);">Fresh Daily Baked Goods</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 40px; height: 40px; background: var(--primary-color); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--secondary-color); font-weight: bold;">3</div>
                        <span style="color: var(--text-light);">Expertly Grilled Specialties</span>
                    </div>
                </div>
                <div style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid rgba(218, 165, 32, 0.2);">
                    <p style="color: var(--text-light); font-size: 0.9rem; line-height: 1.6; margin-bottom: 1rem;">
                        Located in the heart of Malé, we bring you the finest traditional flavors with a modern twist.
                    </p>
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <div style="flex: 1; text-align: center; padding: 1rem; background: rgba(218, 165, 32, 0.05); border-radius: 10px;">
                            <div style="color: var(--primary-color); font-size: 1.2rem; font-weight: bold;">24/7</div>
                            <div style="color: var(--text-light); font-size: 0.8rem;">Fresh Baking</div>
                        </div>
                        <div style="flex: 1; text-align: center; padding: 1rem; background: rgba(218, 165, 32, 0.05); border-radius: 10px;">
                            <div style="color: var(--primary-color); font-size: 1.2rem; font-weight: bold;">100%</div>
                            <div style="color: var(--text-light); font-size: 0.8rem;">Authentic</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
    </div>
</body>
</html>