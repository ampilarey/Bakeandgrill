@extends('layout')

@section('title', 'Prayer Times — Bake & Grill')
@section('description', 'Accurate daily prayer times for all islands of Maldives. Select your island or use your location.')

@section('styles')
<style>
.pt-hero {
    background: linear-gradient(135deg, #0F5C4D 0%, #1e293b 100%);
    color: white;
    padding: 4rem 2rem 5rem;
    text-align: center;
    position: relative;
    overflow: hidden;
}
.pt-hero::before {
    content: '🕌';
    position: absolute;
    font-size: 14rem;
    opacity: 0.04;
    top: -2rem;
    right: -2rem;
    line-height: 1;
    pointer-events: none;
}
.pt-hero h1 {
    font-size: clamp(1.75rem, 4vw, 2.75rem);
    font-weight: 800;
    margin-bottom: 0.75rem;
    letter-spacing: -0.03em;
}
.pt-hero p {
    font-size: 1rem;
    opacity: 0.75;
    max-width: 520px;
    margin: 0 auto;
    line-height: 1.6;
}

.pt-body {
    max-width: 900px;
    margin: -2.5rem auto 4rem;
    padding: 0 1.5rem;
}

.pt-widget-card {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 2rem;
    box-shadow: 0 4px 32px rgba(28,20,8,0.08);
    margin-bottom: 2rem;
}

.pt-info {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.25rem;
    margin-top: 2rem;
}
.pt-info-card {
    background: var(--amber-light);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
}
.pt-info-card h3 {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 0.5rem;
}
.pt-info-card p {
    font-size: 0.9rem;
    color: var(--text);
    line-height: 1.5;
}

.pt-source {
    text-align: center;
    font-size: 0.78rem;
    color: var(--muted);
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
}

@media (max-width: 768px) {
    .pt-hero { padding: 3rem 1rem 4rem; }
    .pt-body { padding: 0 1rem; }
    .pt-widget-card { padding: 1.25rem; }
}
</style>
@endsection

@section('content')

{{-- ── Hero ─────────────────────────────────────────────────── --}}
<div class="pt-hero">
    <h1>🕌 Prayer Times</h1>
    <p>Daily Salat times for all islands of Maldives. Select your island or let us find the nearest one.</p>
</div>

{{-- ── Widget ───────────────────────────────────────────────── --}}
<div class="pt-body">

    <div class="pt-widget-card">
        {{-- Prayer Times Widget --}}
        <div
            data-salat-widget
            data-api-base="{{ $salatApiUrl }}"
            data-theme="light"
            data-lang="dv"
            style="max-width: 600px; margin: 0 auto;"
        ></div>
    </div>

    {{-- Info Cards --}}
    <div class="pt-info">
        <div class="pt-info-card">
            <h3>📍 Location</h3>
            <p>Click the location button in the widget to automatically detect your nearest island.</p>
        </div>
        <div class="pt-info-card">
            <h3>🌅 Prayer Names</h3>
            <p>Fajr · Sunrise · Dhuhr · Asr · Maghrib · Isha — times shown in local Maldives time.</p>
        </div>
        <div class="pt-info-card">
            <h3>📅 Date</h3>
            <p>Times are calculated for today by default. The widget updates automatically every minute.</p>
        </div>
    </div>

    <p class="pt-source">
        Prayer times calculated from verified astronomical data for the Maldives.
        Times may vary slightly based on your local island's coordinates.
    </p>

</div>

<script src="{{ asset('salat-widget.js') }}"></script>

@endsection
