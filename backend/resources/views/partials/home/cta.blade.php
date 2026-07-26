@php
    $sectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'cta-band' : 'cta-band alt';
@endphp

<section class="{{ $sectionClass }}">
    <div class="cta-band-inner">
        <h2>{!! $ctaHeadline !!}</h2>
        <p>{{ $ctaSubtext }}</p>
        <div class="cta-band-btns">
            <a href="/order/" class="btn-primary">🛒 Order Now</a>
            <a href="/order/menu" class="btn-outline">Browse Menu</a>
        </div>
    </div>
</section>
