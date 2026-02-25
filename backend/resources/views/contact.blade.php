@extends('layout')

@section('title', 'Contact Us – Bake & Grill')
@section('description', 'Find Bake & Grill in Malé. Call us, WhatsApp, or visit us at Kalaafaanu Hingun.')

@section('styles')
<style>
.page-hero {
    background: linear-gradient(160deg, var(--amber-light) 0%, var(--bg) 60%);
    border-bottom: 1px solid var(--border);
    padding: 4rem 2rem 3.5rem;
    text-align: center;
}
.page-hero-eyebrow {
    display: inline-block;
    font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--amber); margin-bottom: 0.75rem;
}
.page-hero h1 {
    font-size: 2.75rem; font-weight: 800;
    letter-spacing: -0.04em; color: var(--dark);
    margin-bottom: 0.75rem;
}
.page-hero p { font-size: 1.05rem; color: var(--muted); }

@media (max-width: 600px) { .page-hero h1 { font-size: 2rem; } }

/* ─── Contact Grid ───────────────────────────────────────────────── */
.contact-section {
    max-width: 1100px;
    margin: 0 auto;
    padding: 4rem 2rem;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1.5rem;
}
@media (max-width: 800px) { .contact-section { grid-template-columns: 1fr; padding: 2.5rem 1rem; } }

.contact-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 2rem;
    transition: all 0.2s;
}
.contact-card:hover {
    border-color: rgba(212,129,58,0.3);
    box-shadow: 0 8px 24px rgba(28,20,8,0.07);
    transform: translateY(-2px);
}
.contact-card-icon {
    width: 48px; height: 48px;
    background: var(--amber-light);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem;
    margin-bottom: 1.25rem;
}
.contact-card h2 {
    font-size: 1.1rem; font-weight: 700;
    color: var(--dark); margin-bottom: 1rem;
}
.contact-card p, .contact-card a {
    display: block;
    font-size: 0.925rem;
    color: var(--muted);
    margin-bottom: 0.5rem;
    line-height: 1.6;
    transition: color 0.15s;
}
.contact-card a:hover { color: var(--amber); }
.contact-card strong { color: var(--text); font-weight: 600; }

.contact-link-row {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.5rem 1rem;
    background: var(--amber); color: white;
    border-radius: 8px; font-weight: 700; font-size: 0.85rem;
    margin-top: 0.75rem; transition: all 0.15s;
}
.contact-link-row:hover { background: var(--amber-hover); }

.contact-link-wa {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.5rem 1rem;
    background: #25D366; color: white;
    border-radius: 8px; font-weight: 700; font-size: 0.85rem;
    margin-top: 0.75rem; transition: all 0.15s;
}
.contact-link-wa:hover { background: #1bba58; }

/* ─── Map ────────────────────────────────────────────────────────── */
.map-section {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 2rem 5rem;
}
@media (max-width: 800px) { .map-section { padding: 0 1rem 3rem; } }

.map-section h2 {
    font-size: 1.35rem; font-weight: 700;
    color: var(--dark); margin-bottom: 1.25rem;
}
.map-wrap {
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--border);
    box-shadow: 0 4px 16px rgba(28,20,8,0.06);
}
.map-wrap iframe { display: block; width: 100%; height: 380px; border: none; }
@media (max-width: 600px) { .map-wrap iframe { height: 260px; } }
</style>
@endsection

@section('content')

<div class="page-hero">
    <span class="page-hero-eyebrow">📍 Find Us</span>
    <h1>Contact Us</h1>
    <p>We'd love to hear from you — visit, call, or message us anytime</p>
</div>

<div class="contact-section">

    <div class="contact-card">
        <div class="contact-card-icon">📍</div>
        <h2>Our Location</h2>
        <p><strong>Bake & Grill Café</strong></p>
        <p>Kalaafaanu Hingun</p>
        <p>Malé, Maldives</p>
        <p>Near H. Sahara</p>
        <a href="https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives" target="_blank" class="contact-link-row">
            Open in Maps →
        </a>
    </div>

    <div class="contact-card">
        <div class="contact-card-icon">📞</div>
        <h2>Get in Touch</h2>
        <p><strong>Phone</strong></p>
        <a href="tel:+9609120011">+960 9120011</a>
        <p style="margin-top:0.75rem;"><strong>Email</strong></p>
        <a href="mailto:hello@bakeandgrill.mv">hello@bakeandgrill.mv</a>
        <a href="https://wa.me/9609120011" target="_blank" class="contact-link-wa">
            💬 WhatsApp Us
        </a>
    </div>

    <div class="contact-card">
        <div class="contact-card-icon">🕐</div>
        <h2>Opening Hours</h2>
        <p><strong>Sunday – Thursday</strong></p>
        <p>7:00 AM – 11:00 PM</p>
        <p style="margin-top:0.75rem;"><strong>Friday – Saturday</strong></p>
        <p>7:00 AM – 2:00 AM</p>
        <a href="/hours" class="contact-link-row" style="margin-top:1rem;">
            Full Schedule →
        </a>
    </div>

</div>

<div class="map-section">
    <h2>📍 Find Us on the Map</h2>
    <div class="map-wrap">
        <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3960.9!2d73.5093!3d4.1755!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNMKwMTAnMzEuOCJOIDczwrAzMCczMy41IkU!5e0!3m2!1sen!2s!4v1234567890"
            allowfullscreen=""
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade">
        </iframe>
    </div>
</div>

@endsection
