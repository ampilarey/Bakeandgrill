@extends('layout')
@php
    $phone     = content('business_phone',    '+960 912 0011');
    $phoneTel  = 'tel:' . preg_replace('/[^+\d]/', '', $phone);
    $email     = content('business_email',    'admin@bakeandgrill.mv');
    $address   = content('business_address',  'Kalaafaanu Hingun, Malé, Maldives');
    $landmark  = content('business_landmark', 'Near H. Sahara');
    $mapsUrl   = safe_public_url((string) content('business_maps_url', 'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives'))
        ?? 'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives';
    $waLink    = safe_public_url((string) content('business_whatsapp', 'https://wa.me/9609120011'))
        ?? 'https://wa.me/9609120011';
    $viberLink = safe_public_url((string) content('business_viber', '')) ?? '';
    $mapsEmbedUrl = safe_public_url((string) content('maps_embed_url', 'https://www.google.com/maps?q=Kalaafaanu+Hingun+Male+Maldives&output=embed'))
        ?? 'https://www.google.com/maps?q=Kalaafaanu+Hingun+Male+Maldives&output=embed';
    // Separate address line + city for the card display
    $addressParts = array_map('trim', explode(',', $address, 2));
    $addressLine1 = $addressParts[0] ?? $address;
    $addressLine2 = $addressParts[1] ?? 'Maldives';
    // The schedule set in Admin, the same one the Hours page and footer show
    // (UI audit, 2026-10-10: this card printed a fixed 7 AM to 11 PM).
    $hoursGroups = \App\Support\OpeningHoursText::groups();
    $siteName    = content('site_name', 'Bake & Grill');
@endphp

@section('title', content('contact_meta_title', 'Contact Us – ' . content('site_name', 'Bake & Grill')))
@section('description', 'Find ' . content('site_name', 'Bake & Grill') . ' in Malé. Call us, WhatsApp, or visit us at ' . content('business_address', 'Kalaafaanu Hingun, Malé, Maldives') . '.')

@section('styles')
<style>
.page-hero {
    background: linear-gradient(160deg, var(--amber-light) 0%, var(--bg) 60%);
    border-bottom: 1px solid var(--border);
    padding: 4rem 2rem 3.5rem;
    text-align: center;
}
.page-hero-eyebrow {
    display: inline-flex; align-items: center; gap: 0.35rem;
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
@media (min-width: 769px) {
    .contact-section {
        max-width: var(--desktop-content-max, 1280px);
        width: 100%;
        margin-inline: auto;
        padding-inline: var(--desktop-page-gutter, 2rem);
        box-sizing: border-box;
    }
}

.contact-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 2rem;
    transition: all 0.2s;
}
.contact-card:hover {
    border-color: rgba(183,75,12,0.3);
    box-shadow: 0 8px 24px rgba(28,20,8,0.07);
    transform: translateY(-2px);
}
.contact-card-icon {
    width: 48px; height: 48px;
    background: var(--amber-light);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    color: var(--amber);
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

/* `.contact-card a` (muted brown) out-ranked these, so the button words were
   brown on orange, green and purple in both themes (UI audit, 2026-10-10). */
.contact-card a.contact-link-row,
.contact-card a.contact-link-row:hover { color: var(--amber-contrast); }
.contact-card a.contact-link-wa,
.contact-card a.contact-link-viber,
.contact-card a.contact-link-wa:hover,
.contact-card a.contact-link-viber:hover { color: #fff; }
.contact-link-row {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.5rem 1rem;
    background: var(--amber); color: var(--amber-contrast);
    border-radius: 8px; font-weight: 700; font-size: 0.85rem;
    margin-top: 0.75rem; transition: all 0.15s;
}
.contact-link-row:hover { background: var(--amber-hover); }

.contact-link-wa {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.5rem 1rem;
    background: #15803D; color: #fff;
    border-radius: 8px; font-weight: 700; font-size: 0.85rem;
    margin-top: 0.75rem; transition: all 0.15s;
}
.contact-link-wa:hover { background: #126C34; }
.contact-link-viber {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.5rem 1rem;
    background: #6554E0; color: #fff;
    border-radius: 8px; font-weight: 700; font-size: 0.85rem;
    margin-top: 0.5rem; transition: all 0.15s;
}
.contact-link-viber:hover { background: #5545C8; }
.contact-msg-btns { display: flex; flex-direction: column; }

/* ─── Map ────────────────────────────────────────────────────────── */
.map-section {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 2rem 5rem;
}
@media (max-width: 800px) { .map-section { padding: 0 1rem 3rem; } }
@media (min-width: 769px) {
    .map-section {
        max-width: var(--desktop-content-max, 1280px);
        width: 100%;
        margin-inline: auto;
        padding-inline: var(--desktop-page-gutter, 2rem);
        box-sizing: border-box;
    }
}

.contact-events-cta {
    max-width: 1100px;
    margin: 0 auto 2rem;
    padding: 0 2rem;
}
@media (max-width: 800px) {
    .contact-events-cta { padding: 0 1rem; }
}
@media (min-width: 769px) {
    .contact-events-cta {
        max-width: var(--desktop-content-max, 1280px);
        width: 100%;
        margin-inline: auto;
        margin-bottom: 2rem;
        padding-inline: var(--desktop-page-gutter, 2rem);
        box-sizing: border-box;
    }
}

.map-section h2 {
    display: flex; align-items: center; gap: 0.5rem;
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
    <span class="page-hero-eyebrow">{{ \App\Support\UiIcon::label((string) content('contact_page_eyebrow', 'Find Us'), 'map-pin', 14) }}</span>
    <h1>{{ content('contact_page_title', 'Contact Us') }}</h1>
    <p>{{ content('contact_page_subtitle', "Visit us in Malé, call ahead, or drop us a message on WhatsApp or Viber — we're always happy to help") }}</p>
</div>

<div class="contact-section">

    <div class="contact-card">
        <div class="contact-card-icon">{{ \App\Support\UiIcon::svg('map-pin', 22) }}</div>
        <h2>{{ content('contact_location_heading', 'Our Location') }}</h2>
        <p><strong>{{ $siteName }}</strong></p>
        <p>{{ $addressLine1 }}</p>
        <p>{{ $addressLine2 }}</p>
        <p>{{ $landmark }}</p>
        <a href="{{ $mapsUrl }}" target="_blank" class="contact-link-row">
            {{ content('contact_location_maps_label', 'Open in Maps →') }}
        </a>
    </div>

    <div class="contact-card">
        <div class="contact-card-icon">{{ \App\Support\UiIcon::svg('phone', 22) }}</div>
        <h2>{{ content('contact_touch_heading', 'Get in Touch') }}</h2>
        <p><strong>{{ content('contact_phone_label', 'Phone') }}</strong></p>
        <a href="{{ $phoneTel }}">{{ $phone }}</a>
        <p style="margin-top:0.75rem;"><strong>{{ content('contact_email_label', 'Email') }}</strong></p>
        <a href="mailto:{{ $email }}">{{ $email }}</a>
        <div class="contact-msg-btns">
            <a href="{{ $waLink }}" target="_blank" rel="noopener" class="contact-link-wa">
                {{ \App\Support\UiIcon::label((string) content('contact_whatsapp_label', 'WhatsApp'), 'message-circle') }}
            </a>
            @if($viberLink !== '')
                <a href="{{ $viberLink }}" class="contact-link-viber">
                    {{ \App\Support\UiIcon::label((string) content('contact_viber_label', 'Viber'), 'smartphone') }}
                </a>
            @endif
        </div>
    </div>

    <div class="contact-card">
        <div class="contact-card-icon">{{ \App\Support\UiIcon::svg('clock', 22) }}</div>
        <h2>{{ content('contact_hours_heading', 'Opening Hours') }}</h2>
        @foreach($hoursGroups as $group)
            <p {!! !$loop->first ? 'style="margin-top:0.75rem;"' : '' !!}><strong>{{ $group['days'] }}</strong></p>
            <p>{{ $group['hours'] }}</p>
        @endforeach
        <a href="/hours" class="contact-link-row" style="margin-top:1rem;">
            {{ content('contact_schedule_label', 'Full Schedule →') }}
        </a>
    </div>

</div>

@php
    $contactEventsHeadline = content('contact_events_cta_headline', 'Planning an event?');
    $contactEventsText = content('contact_events_cta_text', 'Build a draft order with catering trays and custom lines — we will send a quote.');
@endphp
{{-- The complaint box (owner, 2026-09-19): straight to the owner, anonymous or with a number. --}}
<section class="contact-events-cta" data-testid="contact-complaint-cta">
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:1.75rem 2rem; text-align:center;">
        <h2 style="font-size:1.35rem; font-weight:800; color:var(--dark); margin:0 0 0.5rem;">Something to complain about?</h2>
        <p style="margin:0 0 1rem; color:var(--muted); font-size:0.95rem;">Staff, food, service or cleanliness — tell the owner directly. Stay anonymous, or leave your number and we will message you back.</p>
        <a href="/complain" class="btn-primary" style="display:inline-flex; min-height:44px; align-items:center; padding:0 1.25rem;">Make a complaint →</a>
    </div>
</section>

<section class="contact-events-cta">
    <div style="background:var(--amber-light); border:1px solid var(--border); border-radius:16px; padding:1.75rem 2rem; text-align:center;">
        <h2 style="font-size:1.35rem; font-weight:800; color:var(--dark); margin:0 0 0.5rem;">{{ $contactEventsHeadline }}</h2>
        <p style="margin:0 0 1rem; color:var(--muted); font-size:0.95rem;">{{ $contactEventsText }}</p>
        <a href="/order/events" class="btn-primary" style="display:inline-flex; min-height:44px; align-items:center; padding:0 1.25rem;">Plan your event →</a>
    </div>
</section>

<div class="map-section">
    <h2 class="map-heading">{{ \App\Support\UiIcon::label((string) content('contact_map_heading', 'Find Us on the Map'), 'map-pin', 20) }}</h2>
    <div class="map-wrap">
        <iframe
            title="Bake & Grill location on Google Maps"
            src="{{ $mapsEmbedUrl }}"
            allowfullscreen=""
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade">
        </iframe>
    </div>
</div>

@endsection
