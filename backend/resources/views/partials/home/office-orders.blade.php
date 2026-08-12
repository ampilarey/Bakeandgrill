@php
    $enabled = content('office_orders_enabled', 'true');
    if (in_array(strtolower((string) $enabled), ['false', '0', 'no', 'off'], true)) {
        return;
    }
    $headline = content('office_orders_headline', 'Office & catering orders');
    $sub = content('office_orders_subtext', 'Plan trays and office breakfasts with a structured quote.');
@endphp
<section class="home-office-orders" data-home-block="office_orders" style="padding:2.5rem 1.5rem; background:var(--surface-alt, var(--surface)); border-top:1px solid var(--border);">
    <div style="max-width:520px; margin:0 auto; text-align:center; background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:1.5rem;">
        <h2 style="font-size:clamp(1.2rem,3vw,1.5rem); font-weight:800; margin:0 0 0.5rem; color:var(--dark);">{{ $headline }}</h2>
        <p style="font-size:0.9rem; color:var(--muted); line-height:1.55; margin:0 0 1.25rem;">{{ $sub }}</p>
        <a href="/order/events" class="btn-primary" style="min-height:48px; display:inline-flex; align-items:center; padding:0 1.25rem;">Plan your event</a>
    </div>
</section>
