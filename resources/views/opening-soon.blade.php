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
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Poppins', sans-serif;
            background: #E3F2FD;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .container {
            text-align: center;
            padding: 2rem;
        }
        
        /* Tea Cup Image */
        .teacup-wrapper {
            margin-bottom: 3rem;
        }
        
        .teacup-image {
            width: 100%;
            max-width: 500px;
            height: auto;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
        }
        
        /* Text Content */
        .brand-name {
            font-size: 3.5rem;
            font-weight: 700;
            color: #1976D2;
            margin-bottom: 1rem;
        }
        
        .dhivehi-text {
            font-size: 2rem;
            font-weight: 600;
            color: #0D47A1;
            margin-bottom: 2rem;
            direction: rtl;
            font-family: 'Times New Roman', serif;
        }
        
        .opening-soon {
            font-size: 1.5rem;
            font-weight: 600;
            color: #424242;
            margin-bottom: 2rem;
        }
        
        .contact {
            font-size: 1rem;
            color: #616161;
            line-height: 1.8;
        }
        
        .contact a {
            color: #1976D2;
            text-decoration: none;
        }
        
        .contact a:hover {
            text-decoration: underline;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .brand-name {
                font-size: 2.5rem;
            }
            
            .dhivehi-text {
                font-size: 1.5rem;
            }
            
            .opening-soon {
                font-size: 1.2rem;
            }
            
            .teacup-image {
                max-width: 350px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Red Tea Cup Image -->
        <div class="teacup-wrapper">
            <img src="https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=800&auto=format&fit=crop&q=80" 
                 alt="Red Tea Cup" 
                 class="teacup-image"
                 loading="eager">
        </div>
        
        <!-- Content -->
        <h1 class="brand-name">Bake & Grill</h1>
        <div class="dhivehi-text">އަސްލު ދިވެހި ރަހަ</div>
        <div class="opening-soon">Opening Soon</div>
        
        <!-- Contact -->
        <div class="contact">
            <p>Malé, Maldives</p>
            <p><a href="mailto:contact@bakeandgrill.mv">contact@bakeandgrill.mv</a></p>
            <p><a href="tel:+9607000000">+960 700-0000</a></p>
        </div>
    </div>
</body>
</html>
