@extends('layout')

@section('title', 'Contact Us - Bake & Grill')

@section('styles')
<style>
    .contact-hero {
        background: linear-gradient(135deg, rgba(27, 163, 185, 0.08), rgba(184, 168, 144, 0.08));
        padding: 3rem 2rem;
        text-align: center;
    }

    .contact-hero h1 {
        font-size: 2.5rem;
        margin-bottom: 0.5rem;
    }

    .contact-content {
        max-width: 1200px;
        margin: 3rem auto 4rem;
        padding: 0 2rem;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 3rem;
    }

    .contact-card {
        background: white;
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 2rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }

    .contact-card h2 {
        font-size: 1.4rem;
        margin-bottom: 1rem;
        color: var(--teal);
    }

    .contact-card p {
        margin-bottom: 0.75rem;
        line-height: 1.8;
    }

    .contact-card a {
        color: var(--teal);
        font-weight: 500;
    }

    .contact-card a:hover {
        text-decoration: underline;
    }
    
    @media (max-width: 768px) {
        .contact-content {
            grid-template-columns: 1fr;
        }
        
        .contact-hero h1 {
            font-size: 2rem;
        }
    }

    .map {
        width: 100%;
        height: 400px;
        border-radius: 16px;
        border: 1px solid var(--border);
        margin-top: 2rem;
    }
</style>
@endsection

@section('content')
<div class="contact-hero">
    <h1>Contact Us</h1>
    <p>Get in touch for reservations, catering, or questions</p>
</div>

<div class="contact-content">
    <div class="contact-card">
        <h2>📍 Location</h2>
        <p><strong>Bake & Grill Café</strong></p>
        <p>Kalaafaanu hingun</p>
        <p>Male, Maldives</p>
        <p>Near H. Sahara</p>
    </div>

    <div class="contact-card">
        <h2>📞 Contact</h2>
        <p><strong>Phone:</strong> <a href="tel:+9609120011">+960 9120011</a></p>
        <p><strong>WhatsApp:</strong> <a href="https://wa.me/9609120011" target="_blank">Chat with us</a></p>
        <p><strong>Email:</strong> <a href="mailto:hello@bakeandgrill.mv">hello@bakeandgrill.mv</a></p>
    </div>

    <div class="contact-card">
        <h2>🕐 Hours</h2>
        <p>Sunday - Thursday: 7:00 AM - 11:00 PM</p>
        <p>Friday - Saturday: 7:00 AM - 2:00 AM</p>
        <p><a href="/hours">View detailed hours →</a></p>
    </div>
</div>

<div style="max-width: 1200px; margin: 0 auto; padding: 0 2rem 4rem;">
    <iframe 
        class="map"
        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3960.9!2d73.5093!3d4.1755!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNMKwMTAnMzEuOCJOIDczwrAzMCczMy41IkU!5e0!3m2!1sen!2s!4v1234567890"
        style="border:0;" 
        allowfullscreen="" 
        loading="lazy">
    </iframe>
</div>
@endsection
