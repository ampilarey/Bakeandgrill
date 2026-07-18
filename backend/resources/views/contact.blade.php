@extends('layout')
@php
    $phone     = \App\Models\SiteSetting::get('business_phone',    '+960 912 0011');
    $phoneTel  = 'tel:' . preg_replace('/[^+\d]/', '', $phone);
    $email     = \App\Models\SiteSetting::get('business_email',    'admin@bakeandgrill.mv');
    $address   = \App\Models\SiteSetting::get('business_address',  'Kalaafaanu Hingun, Malé, Maldives');
    $landmark  = \App\Models\SiteSetting::get('business_landmark', 'Near H. Sahara');
    $mapsUrl   = \App\Models\SiteSetting::get('business_maps_url', 'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives');
    $waLink    = \App\Models\SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011');
    $viberLink = \App\Models\SiteSetting::get('business_viber',    'viber://chat?number=9609120011');
    // Separate address line + city for the card display
    $addressParts = array_map('trim', explode(',', $address, 2));
    $addressLine1 = $addressParts[0] ?? $address;
    $addressLine2 = $addressParts[1] ?? 'Maldives';
    // Business hours: stored as JSON, fallback to typical hours
    $hoursRaw    = \App\Models\SiteSetting::get('business_hours', null);
    $hoursData   = $hoursRaw ? json_decode($hoursRaw, true) : null;
    $siteName    = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
@endphp

@section('title', \App\Models\SiteSetting::get('contact_meta_title', 'Contact Us – ' . \App\Models\SiteSetting::get('site_name', 'Bake & Grill')))
@section('description', 'Find ' . \App\Models\SiteSetting::get('site_name', 'Bake & Grill') . ' in Malé. Call us, WhatsApp, or visit us at ' . \App\Models\SiteSetting::get('business_address', 'Kalaafaanu Hingun, Malé, Maldives') . '.')

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
.contact-link-viber {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.5rem 1rem;
    background: #7360F2; color: white;
    border-radius: 8px; font-weight: 700; font-size: 0.85rem;
    margin-top: 0.5rem; transition: all 0.15s;
}
.contact-link-viber:hover { background: #5E4CD6; }
.contact-msg-btns { display: flex; flex-direction: column; }

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
    <span class="page-hero-eyebrow">{{ \App\Models\SiteSetting::get('contact_page_eyebrow', '📍 Find Us') }}</span>
    <h1>{{ \App\Models\SiteSetting::get('contact_page_title', 'Contact Us') }}</h1>
    <p>{{ \App\Models\SiteSetting::get('contact_page_subtitle', "Visit us in Malé, call ahead, or drop us a message on WhatsApp or Viber — we're always happy to help") }}</p>
</div>

<div class="contact-section">

    <div class="contact-card">
        <div class="contact-card-icon">📍</div>
        <h2>{{ \App\Models\SiteSetting::get('contact_location_heading', 'Our Location') }}</h2>
        <p><strong>{{ $siteName }}</strong></p>
        <p>{{ $addressLine1 }}</p>
        <p>{{ $addressLine2 }}</p>
        <p>{{ $landmark }}</p>
        <a href="{{ $mapsUrl }}" target="_blank" class="contact-link-row">
            {{ \App\Models\SiteSetting::get('contact_location_maps_label', 'Open in Maps →') }}
        </a>
    </div>

    <div class="contact-card">
        <div class="contact-card-icon">📞</div>
        <h2>{{ \App\Models\SiteSetting::get('contact_touch_heading', 'Get in Touch') }}</h2>
        <p><strong>{{ \App\Models\SiteSetting::get('contact_phone_label', 'Phone') }}</strong></p>
        <a href="{{ $phoneTel }}">{{ $phone }}</a>
        <p style="margin-top:0.75rem;"><strong>{{ \App\Models\SiteSetting::get('contact_email_label', 'Email') }}</strong></p>
        <a href="mailto:{{ $email }}">{{ $email }}</a>
        <div class="contact-msg-btns">
            <a href="{{ $waLink }}" target="_blank" rel="noopener" class="contact-link-wa">
                {{ \App\Models\SiteSetting::get('contact_whatsapp_label', '💬 WhatsApp') }}
            </a>
            <a href="{{ $viberLink }}" class="contact-link-viber">
                {{ \App\Models\SiteSetting::get('contact_viber_label', '📱 Viber') }}
            </a>
        </div>
    </div>

    <div class="contact-card">
        <div class="contact-card-icon">🕐</div>
        <h2>{{ \App\Models\SiteSetting::get('contact_hours_heading', 'Opening Hours') }}</h2>
        @if($hoursData && is_array($hoursData))
            @foreach($hoursData as $period)
                @if(isset($period['days']) && isset($period['hours']))
                    <p><strong>{{ $period['days'] }}</strong></p>
                    <p style="{{ !$loop->first ? 'margin-top:0.75rem;' : '' }}">{{ $period['hours'] }}</p>
                @endif
            @endforeach
        @else
            @php
                $fallbackHours = \App\Models\SiteSetting::get(
                    'contact_hours_fallback',
                    "Sunday \xe2\x80\x93 Thursday: 7:00 AM \xe2\x80\x93 11:00 PM\nFriday \xe2\x80\x93 Saturday: 7:00 AM \xe2\x80\x93 2:00 AM"
                );
                $fallbackLines = array_filter(array_map('trim', explode("\n", $fallbackHours)));
            @endphp
            @foreach($fallbackLines as $fLine)
                @php [$fDays, $fHrs] = array_pad(explode(':', $fLine, 2), 2, ''); @endphp
                <p {{ !$loop->first ? 'style="margin-top:0.75rem;"' : '' }}><strong>{{ trim($fDays) }}</strong></p>
                <p>{{ trim($fHrs) }}</p>
            @endforeach
        @endif
        <a href="/hours" class="contact-link-row" style="margin-top:1rem;">
            {{ \App\Models\SiteSetting::get('contact_schedule_label', 'Full Schedule →') }}
        </a>
    </div>

</div>

<div class="map-section">
    <h2>{{ \App\Models\SiteSetting::get('contact_map_heading', '📍 Find Us on the Map') }}</h2>
    <div class="map-wrap">
        <iframe
            title="Bake & Grill location on Google Maps"
            src="{{ \App\Models\SiteSetting::get('maps_embed_url', 'https://www.google.com/maps?q=Kalaafaanu+Hingun+Male+Maldives&output=embed') }}"
            allowfullscreen=""
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade">
        </iframe>
    </div>
</div>

@endsection
