@php
    $sectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'section' : 'section alt';
@endphp

<section class="{{ $sectionClass }}">
    <div class="section-inner">
        <div class="section-header">
            <span class="section-eyebrow">{{ $homeCategoriesEyebrow }}</span>
            <h2 class="section-title">{{ $homeCategoriesTitle }}</h2>
            <p class="section-sub">{{ $homeCategoriesSubtitle }}</p>
        </div>
        <div class="categories-grid">
            @foreach($categories as $cat)
            <a href="{{ normalize_public_menu_link($cat['link'] ?? '/order/menu') }}" class="cat-card">
                <div class="cat-img">
                    @if(!empty($cat['image_url']))
                        <img src="{{ $cat['image_url'] }}"
                             alt="{{ $cat['image_alt'] ?? ($cat['name'] ?? '') }}"
                             data-fallback-class="cat-img-placeholder"
                             data-fallback-icon="{{ $cat['icon'] ?? '🍽️' }}">
                    @else
                        <div class="cat-img-placeholder">{{ $cat['icon'] ?? '🍽️' }}</div>
                    @endif
                </div>
                <div class="cat-body">
                    <div class="cat-label">{{ $cat['label'] ?? '' }}</div>
                    <div class="cat-name">{{ $cat['name'] ?? '' }}</div>
                    <p class="cat-hook">{{ $cat['hook'] ?? '' }}</p>
                    <span class="cat-link">Order now →</span>
                </div>
            </a>
            @endforeach
        </div>
    </div>
</section>
