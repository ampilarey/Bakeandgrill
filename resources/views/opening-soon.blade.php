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
    
    <!-- A_Faruwa Font for Dhivehi - Fallback to system font if not available -->
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        :root {
            --primary-color: #059669;
            --primary-dark: #047857;
            --secondary-color: #10b981;
            --accent-color: #f59e0b;
            --text-dark: #064e3b;
            --text-light: #374151;
            --bg-gradient: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%);
            --glass-bg: rgba(255, 255, 255, 0.25);
            --glass-border: rgba(255, 255, 255, 0.18);
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
            width: 120px;
            height: 120px;
            background: white;
            border-radius: 20px;
            padding: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            margin-bottom: 2rem;
            animation: pulse 2s infinite;
        }
        
        .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
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
            box-shadow: 0 10px 30px rgba(5, 150, 105, 0.3);
            animation: bounce 2s infinite;
        }
        
        .tagline {
            font-size: 1.3rem;
            color: var(--text-light);
            margin-bottom: 3rem;
            line-height: 1.6;
        }
        
        .contact-card {
            background: var(--glass-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--glass-border);
            border-radius: 20px;
            padding: 2rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        
        .contact-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1.5rem;
            font-size: 1.1rem;
            color: var(--text-dark);
        }
        
        .contact-item:last-child {
            margin-bottom: 0;
        }
        
        .contact-icon {
            width: 24px;
            height: 24px;
            color: var(--primary-color);
        }
        
        .contact-item a {
            color: var(--text-dark);
            text-decoration: none;
            transition: color 0.3s ease;
        }
        
        .contact-item a:hover {
            color: var(--primary-color);
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
            
            .contact-card {
                padding: 1.5rem;
            }
            
            .hero-image {
                height: 300px;
            }
            
            .floating-element {
                display: none;
            }
        }
    </style>
</head>
<body>
    <!-- Background Decorations -->
    <div class="bg-decoration"></div>
    <div class="bg-decoration"></div>
    <div class="bg-decoration"></div>
    
    <div class="container">
        <!-- Left Side - Content -->
        <div class="content-side">
            <div class="logo-section">
                <div class="logo">
                    <img src="{{ asset('logo.svg') }}" alt="Bake & Grill Logo">
                </div>
            </div>
            
            <h1 class="brand-name">Bake & Grill</h1>
            <div class="dhivehi-text">އަސްލު ދިވެހި ރަހަ</div>
            
            <div class="opening-badge">Opening Soon</div>
            
            <p class="tagline">
                Experience the authentic flavors of traditional Dhivehi cuisine, 
                freshly baked goods, and expertly grilled specialties in the heart of Malé.
            </p>
            
            <div class="contact-card">
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
        
        <!-- Right Side - Hero Image -->
        <div class="image-side">
            <div class="image-container">
                <img src="https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=800&auto=format&fit=crop&q=80" 
                     alt="Delicious Grilled Food" 
                     class="hero-image"
                     loading="eager">
            </div>
            
            <!-- Floating Elements -->
            <div class="floating-element">
                <div style="font-size: 0.9rem; color: var(--primary-color); font-weight: 600;">🍞 Fresh Daily</div>
            </div>
            <div class="floating-element">
                <div style="font-size: 0.9rem; color: var(--primary-color); font-weight: 600;">🔥 Grilled to Perfection</div>
            </div>
        </div>
    </div>
</body>
</html>
