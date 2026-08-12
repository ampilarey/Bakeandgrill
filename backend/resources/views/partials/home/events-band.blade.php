@php
    $eventsHeadline = content('events_section_headline', 'Events & Catering');
    $eventsBlurb = content('events_section_blurb', 'Plan office breakfasts, celebrations, and catering trays with a structured quote — not just a same-day order.');
    $eventsBrowseCta = content('events_section_browse_cta', 'Browse catering menu');
    $eventsPlanCta = content('events_section_plan_cta', 'Plan your event');
@endphp
<section class="events-band" data-home-block="events_band" style="padding:3.5rem 2rem; background:var(--surface); border-top:1px solid var(--border);">
    <div style="max-width:640px; margin:0 auto; text-align:center;">
        <h2 style="font-size:clamp(1.5rem,3vw,2rem); font-weight:800; color:var(--dark); margin:0 0 0.75rem;">{{ $eventsHeadline }}</h2>
        <p style="font-size:1rem; color:var(--muted); line-height:1.55; margin:0 0 1.5rem;">{{ $eventsBlurb }}</p>
        <div style="display:flex; gap:0.75rem; flex-wrap:wrap; justify-content:center;">
            <a href="/order/catering" class="btn-outline" style="min-height:48px; display:inline-flex; align-items:center; padding:0 1.25rem;">{{ $eventsBrowseCta }}</a>
            <a href="/order/events" class="btn-primary" style="min-height:48px; display:inline-flex; align-items:center; padding:0 1.25rem;">{{ $eventsPlanCta }}</a>
        </div>
    </div>
</section>
