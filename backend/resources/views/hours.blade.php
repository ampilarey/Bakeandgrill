@extends('layout')

@section('title', 'Opening Hours – Bake & Grill')
@section('description', 'See our opening hours. Bake & Grill is open 7 days a week in Malé, Maldives.')

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
    margin-bottom: 1rem;
}
@media (max-width: 600px) { .page-hero h1 { font-size: 2rem; } }

.hours-wrap {
    max-width: 600px;
    margin: 0 auto;
    padding: 3.5rem 2rem 5rem;
}

.closure-notice {
    background: #FFF3CD;
    border: 1px solid #F5C842;
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 2rem;
    display: flex; align-items: flex-start; gap: 0.75rem;
    font-size: 0.9rem;
}
.closure-notice .cn-icon { font-size: 1.25rem; flex-shrink: 0; margin-top: 0.1rem; }

.hours-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(28,20,8,0.06);
    margin-bottom: 1.5rem;
}
.hours-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.1rem 1.75rem;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
}
.hours-row:last-child { border-bottom: none; }
.hours-row.today {
    background: var(--amber-light);
    border-left: 3px solid var(--amber);
}
.hours-row-left { display: flex; align-items: center; gap: 0.75rem; }
.day-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--border); flex-shrink: 0;
}
.hours-row.today .day-dot { background: var(--amber); }
.day-name { font-weight: 600; font-size: 0.95rem; color: var(--text); }
.hours-row.today .day-name { color: var(--amber-hover); }
.today-tag {
    font-size: 0.65rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.07em;
    color: var(--amber);
    background: rgba(212,129,58,0.12);
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
}
.hours-time {
    font-weight: 700; font-size: 0.95rem; color: var(--dark);
    font-variant-numeric: tabular-nums;
}
.hours-closed { color: var(--muted); font-weight: 500; }

.hours-note {
    text-align: center;
    color: var(--muted);
    font-size: 0.875rem;
    line-height: 1.6;
    margin-top: 1.5rem;
}
.hours-note a { color: var(--amber); font-weight: 600; }
.hours-note a:hover { text-decoration: underline; }

.order-cta-block {
    margin-top: 2rem;
    background: var(--amber-light);
    border: 1px solid rgba(212,129,58,0.25);
    border-radius: 16px;
    padding: 1.75rem;
    text-align: center;
}
.order-cta-block h3 { font-size: 1.1rem; font-weight: 700; color: var(--dark); margin-bottom: 0.5rem; }
.order-cta-block p  { font-size: 0.875rem; color: var(--muted); margin-bottom: 1.25rem; }
.order-cta-link {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.75rem 1.75rem;
    background: var(--amber); color: white;
    border-radius: 10px; font-weight: 700; font-size: 0.95rem;
    transition: all 0.15s;
}
.order-cta-link:hover { background: var(--amber-hover); }
</style>
@endsection

@section('content')

<div class="page-hero">
    <span class="page-hero-eyebrow">🕐 Schedule</span>
    <h1>Opening Hours</h1>
    @if($isOpen)
        <span class="status-badge open">● We're open right now</span>
    @else
        <span class="status-badge closed">● Currently closed</span>
    @endif
</div>

<div class="hours-wrap">

    @if($closureReason)
        <div class="closure-notice">
            <span class="cn-icon">⚠️</span>
            <div><strong>Special Closure:</strong> {{ $closureReason }}</div>
        </div>
    @endif

    @php
        $days  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        $today = now(config('opening_hours.timezone'))->dayOfWeek;
    @endphp

    <div class="hours-card">
        @foreach($days as $index => $day)
            @php $dayHours = $hours[$index] ?? null; @endphp
            <div class="hours-row {{ $index === $today ? 'today' : '' }}">
                <div class="hours-row-left">
                    <div class="day-dot"></div>
                    <span class="day-name">{{ $day }}</span>
                    @if($index === $today)
                        <span class="today-tag">Today</span>
                    @endif
                </div>
                <span class="{{ ($dayHours && !($dayHours['closed'] ?? false)) ? 'hours-time' : 'hours-closed' }}">
                    @if($dayHours && !($dayHours['closed'] ?? false))
                        {{ $dayHours['open'] }} – {{ $dayHours['close'] }}
                    @else
                        Closed
                    @endif
                </span>
            </div>
        @endforeach
    </div>

    <p class="hours-note">
        Hours may vary on public holidays.<br>
        Call us to confirm: <a href="tel:+9609120011">+960 9120011</a> &nbsp;·&nbsp;
        <a href="/contact">Contact page →</a>
    </p>

    <div class="order-cta-block">
        <h3>Ready to order?</h3>
        <p>Place your order online and have it delivered fresh to your door</p>
        <a href="/order/" class="order-cta-link">🛒 Order Online Now</a>
    </div>

</div>

@endsection
