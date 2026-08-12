@php
    $siteName = content('site_name', 'Bake & Grill');
@endphp
<section class="home-greeting" data-home-block="greeting" style="padding:1.25rem 1.5rem 0.5rem; max-width:960px; margin:0 auto;">
    <p style="font-size:clamp(1.25rem,3vw,1.6rem); font-weight:800; color:var(--dark); margin:0;">
        Welcome to {{ $siteName }}
    </p>
</section>
