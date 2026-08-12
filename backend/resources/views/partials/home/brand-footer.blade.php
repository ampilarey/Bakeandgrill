@php
    $siteName = content('site_name', 'Bake & Grill');
    $blurb = content('footer_text', '');
    $thanks = content('footer_thanks', '');
    $chatLabel = content('home_chat_label', 'Chat with us');
    $wa = content('business_whatsapp', '');
    $viber = content('business_viber', '');
    $logo = content('logo', '/logo.png');
@endphp
<section class="home-brand-footer" data-home-block="brand_footer" style="padding:2.5rem 1.5rem; border-top:1px solid var(--border); background:var(--surface);">
    <div style="max-width:640px; margin:0 auto; text-align:center;">
        @if($logo)
            <img src="{{ $logo }}" alt="{{ $siteName }}" style="height:40px; width:auto; margin:0 auto 1rem; display:block;" />
        @endif
        <p style="font-weight:800; font-size:1.1rem; margin:0 0 0.5rem; color:var(--dark);">{{ $siteName }}</p>
        @if($blurb !== '')
            <p style="font-size:0.9rem; color:var(--muted); line-height:1.5; margin:0 0 0.75rem;">{{ $blurb }}</p>
        @endif
        @if($thanks !== '')
            <p style="font-size:0.85rem; color:var(--muted); margin:0 0 1rem;">{{ $thanks }}</p>
        @endif
        <div style="display:flex; gap:0.75rem; flex-wrap:wrap; justify-content:center;">
            @if($wa)
                <a href="{{ e($wa) }}" class="btn-outline" style="min-height:44px; display:inline-flex; align-items:center; padding:0 1rem;">{{ $chatLabel }} · WhatsApp</a>
            @endif
            @if($viber)
                <a href="{{ e($viber) }}" class="btn-outline" style="min-height:44px; display:inline-flex; align-items:center; padding:0 1rem;">{{ $chatLabel }} · Viber</a>
            @endif
        </div>
    </div>
</section>
