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
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Lato', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }
        
        /* Subtle overlay pattern */
        body::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: 
                radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 80% 50%, rgba(255, 255, 255, 0.05) 0%, transparent 50%);
            pointer-events: none;
        }
        
        .container {
            text-align: center;
            max-width: 1200px;
            width: 100%;
            padding: 2rem;
            position: relative;
            z-index: 2;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        
        /* Tea Cup Image */
        .image-container {
            position: relative;
            width: 100%;
            max-width: 600px;
            margin-bottom: 3rem;
            animation: float 4s ease-in-out infinite;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
        }
        
        .teacup-image {
            width: 100%;
            height: auto;
            border-radius: 30px;
            box-shadow: 0 30px 80px rgba(0, 0, 0, 0.3),
                        0 0 0 1px rgba(255, 255, 255, 0.1);
            background: #fff;
        }
        
        /* Content */
        .content {
            background: rgba(255, 255, 255, 0.95);
            padding: 3rem 2rem;
            border-radius: 30px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
            max-width: 700px;
            width: 100%;
            backdrop-filter: blur(10px);
        }
        
        .brand-name {
            font-family: 'Playfair Display', serif;
            font-size: 4rem;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 1rem;
            letter-spacing: 1px;
        }
        
        .dhivehi-text {
            font-size: 2.5rem;
            font-weight: 600;
            color: #667eea;
            margin-bottom: 1.5rem;
            direction: rtl;
            font-family: 'Times New Roman', serif;
        }
        
        .tagline {
            font-size: 1.2rem;
            color: #718096;
            font-weight: 400;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-bottom: 2rem;
        }
        
        .opening-badge {
            display: inline-block;
            padding: 1rem 2.5rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-bottom: 2rem;
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
        }
        
        /* Contact */
        .contact {
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 2px solid #e2e8f0;
        }
        
        .contact-items {
            display: flex;
            justify-content: center;
            gap: 2rem;
            flex-wrap: wrap;
        }
        
        .contact-item {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            color: #4a5568;
            font-size: 0.95rem;
        }
        
        .contact-item svg {
            width: 18px;
            height: 18px;
            fill: #667eea;
        }
        
        .contact-item a {
            color: #4a5568;
            text-decoration: none;
            transition: color 0.3s ease;
        }
        
        .contact-item a:hover {
            color: #667eea;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }
            
            .brand-name {
                font-size: 2.5rem;
            }
            
            .dhivehi-text {
                font-size: 1.8rem;
            }
            
            .tagline {
                font-size: 0.9rem;
            }
            
            .content {
                padding: 2rem 1.5rem;
            }
            
            .image-container {
                max-width: 400px;
            }
            
            .contact-items {
                flex-direction: column;
                gap: 1rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Tea Cup Image -->
        <div class="image-container">
            <img src="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&auto=format&fit=crop&q=80" 
                 alt="Coffee Cup" 
                 class="teacup-image"
                 loading="eager">
        </div>
        
        <!-- Content -->
        <div class="content">
            <h1 class="brand-name">Bake & Grill</h1>
            <div class="dhivehi-text">އަސްލު ދިވެހި ރަހަ</div>
            <p class="tagline">Authentic Maldivian Flavors</p>
            
            <div class="opening-badge">Opening Soon</div>
            
            <!-- Contact -->
            <div class="contact">
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
    </div>
</body>
</html>
