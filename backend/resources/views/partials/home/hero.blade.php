{{-- Website home hero — included from page_blocks walker --}}
<div class="hero-banner">

    {{-- Open/Closed status badge --}}
    @if($isOpen)
        <div class="hero-status open">
            <span class="hero-status-dot"></span>
            {{ $homeOpenBadgeText }}
            @if($todayHours) · Closes {{ $todayHours['close'] }}@endif
        </div>
    @else
        <div class="hero-status closed">
            <span class="hero-status-dot"></span>
            {{ $homeClosedBadgeText }}
            @if($todayHours) · Opens {{ $todayHours['open'] }}@endif
        </div>
    @endif

    <div class="banner-track" id="bannerTrack">
        @if(count($heroSlides) > 0)
            @foreach($heroSlides as $sIdx => $slide)
            @php
                $focalX = isset($slide['image_focal_x']) ? (float) $slide['image_focal_x'] : 50;
                $focalY = isset($slide['image_focal_y']) ? (float) $slide['image_focal_y'] : 50;
                $imgAlt = $slide['image_alt'] ?? content('site_name', 'Bake & Grill');
                // Lockstep with order-app resolveHeroSlidePresentation / --hero-photo|--hero-scrim
                $heroPres = \App\Domains\Content\HeroSlides::presentation(is_array($slide) ? $slide : []);
                $heroPhoto = $heroPres['photo'];
                $heroScrim = $heroPres['scrim'];
                $heroTextPos = $heroPres['text_position'];
            @endphp
            <div class="banner-slide {{ $sIdx === 0 ? 'active' : '' }}" style="background:#1C1408;--hero-photo:{{ $heroPhoto }};--hero-scrim:{{ $heroScrim }};">
                @if(!empty($slide['video']))
                    <video
                        class="banner-video"
                        src="{{ $slide['video'] }}"
                        poster="{{ $slide['video_poster'] ?? ($slide['image'] ?? '') }}"
                        autoplay muted loop playsinline
                        style="object-position:{{ $focalX }}% {{ $focalY }}%;"
                    ></video>
                @elseif(!empty($slide['image']))
                    <img
                        src="{{ $slide['image'] }}"
                        loading="eager"
                        decoding="async"
                        alt="{{ $imgAlt }}"
                        style="object-position:{{ $focalX }}% {{ $focalY }}%;"
                    >
                @endif
                <div class="banner-overlay" data-text-position="{{ $heroTextPos }}">
                    @php
                        $eyebrow = trim((string) ($slide['eyebrow'] ?? ''));
                        $titleHtml = (string) ($slide['title'] ?? '');
                        // Match order-app: omit empty title so it doesn't leave a blank line gap
                        $titleVisible = trim(html_entity_decode(strip_tags($titleHtml), ENT_QUOTES | ENT_HTML5, 'UTF-8')) !== '';
                        $subtitle = trim((string) ($slide['subtitle'] ?? ''));
                        $cta1Text = trim((string) ($slide['cta_text'] ?? ''));
                        $cta2Text = trim((string) ($slide['cta2_text'] ?? ''));
                        $cta1Raw = trim((string) ($slide['cta_url'] ?? ''));
                        $cta2Raw = trim((string) ($slide['cta2_url'] ?? ''));
                        $cta1Href = safe_public_url($cta1Raw !== '' ? $cta1Raw : '/order/') ?? '#';
                        $cta2Href = safe_public_url($cta2Raw !== '' ? normalize_public_menu_link($cta2Raw) : '/order/menu') ?? '#';
                        $el = $heroPres['elements'] ?? [];
                        $eyebrowEl = $el['eyebrow'] ?? ['css' => null];
                        $titleEl = $el['title'] ?? ['css' => null, 'full_width' => false];
                        $subEl = $el['subtitle'] ?? ['css' => null, 'full_width' => false];
                        $cta1El = $el['cta1'] ?? ['css' => null];
                        $cta2El = $el['cta2'] ?? ['css' => null];
                    @endphp
                    <div class="banner-copy">
                    @if($eyebrow !== '')
                        <span
                            class="banner-eyebrow"
                            @if(!empty($eyebrowEl['css']))
                                data-has-bg="1"
                                style="--hero-el-bg: {{ $eyebrowEl['css'] }}; background: var(--hero-el-bg);"
                            @endif
                        >{{ $eyebrow }}</span>
                    @endif
                    @if($titleVisible)
                        {{-- Text-hug: one .hero-text-bg pill per <br> line (avoids clone overlap). --}}
                        <h2
                            class="banner-title"
                            @if(!empty($titleEl['css']) && !empty($titleEl['full_width']))
                                data-has-bg="1"
                                data-bg-full="1"
                                style="--hero-el-bg: {{ $titleEl['css'] }}; background: var(--hero-el-bg);"
                            @elseif(!empty($titleEl['css']))
                                data-bg-hug="1"
                            @endif
                        >
                            @if(!empty($titleEl['css']) && empty($titleEl['full_width']))
                                @foreach(\App\Domains\Content\HeroSlides::splitRichTextLines($titleHtml) as $titleLine)
                                    <span
                                        class="hero-text-bg"
                                        data-has-bg="1"
                                        data-bg-full="0"
                                        style="--hero-el-bg: {{ $titleEl['css'] }}; background: var(--hero-el-bg);"
                                    >{!! $titleLine !!}</span>
                                @endforeach
                            @else
                                {!! $titleHtml !!}
                            @endif
                        </h2>
                    @endif
                    @if($subtitle !== '')
                        <p
                            class="banner-sub"
                            @if(!empty($subEl['css']) && !empty($subEl['full_width']))
                                data-has-bg="1"
                                data-bg-full="1"
                                style="--hero-el-bg: {{ $subEl['css'] }}; background: var(--hero-el-bg);"
                            @elseif(!empty($subEl['css']))
                                data-bg-hug="1"
                            @endif
                        >
                            @if(!empty($subEl['css']) && empty($subEl['full_width']))
                                <span
                                    class="hero-text-bg"
                                    data-has-bg="1"
                                    data-bg-full="0"
                                    style="--hero-el-bg: {{ $subEl['css'] }}; background: var(--hero-el-bg);"
                                >{{ $subtitle }}</span>
                            @else
                                {{ $subtitle }}
                            @endif
                        </p>
                    @endif
                    @if($cta1Text !== '' || $cta2Text !== '')
                    <div class="banner-ctas">
                        @if($cta1Text !== '')
                            <a
                                href="{{ $cta1Href }}"
                                class="banner-cta-primary"
                                @if(!empty($cta1El['css']))
                                    data-has-bg="1"
                                    style="--hero-el-bg: {{ $cta1El['css'] }}; background: var(--hero-el-bg);"
                                @endif
                            >{{ $cta1Text }}</a>
                        @endif
                        @if($cta2Text !== '')
                            <a
                                href="{{ $cta2Href }}"
                                class="banner-cta-secondary"
                                @if(!empty($cta2El['css']))
                                    data-has-bg="1"
                                    style="--hero-el-bg: {{ $cta2El['css'] }}; background: var(--hero-el-bg);"
                                @endif
                            >{{ $cta2Text }}</a>
                        @endif
                    </div>
                    @endif
                    </div>
                </div>
            </div>
            @endforeach
        @else
            {{-- Fallback slide when no hero slides are configured in CMS --}}
            @php
                $siteName = content('site_name', 'Bake & Grill');
                $tagline  = content('site_tagline', 'Dhivehi Breakfast & Artisan Baking');
            @endphp
            <div class="banner-slide active" style="background: linear-gradient(160deg, #2D1A0A 0%, #1C1408 100%);">
                <div class="banner-overlay">
                    <div class="banner-copy">
                    <span class="banner-eyebrow">🍞 Fresh daily from 5am</span>
                    <h2 class="banner-title">{{ $siteName }}<br><em>{{ $tagline }}</em></h2>
                    <p class="banner-sub">Real food, proper char — order online or visit us in Malé.</p>
                    <div class="banner-ctas">
                        <a href="/order/" class="banner-cta-primary">🛒 Order Now →</a>
                        <a href="/order/menu" class="banner-cta-secondary">View Menu</a>
                    </div>
                    </div>
                </div>
            </div>
        @endif
    </div>

    @if($slideCount > 1)
    <button class="banner-btn prev" aria-label="Previous slide">‹</button>
    <button class="banner-btn next" aria-label="Next slide">›</button>

    <div class="banner-dots" id="bannerDots" role="tablist" aria-label="Slides">
        @for($d = 0; $d < $slideCount; $d++)
            <button
                type="button"
                class="banner-dot {{ $d === 0 ? 'active' : '' }}"
                data-slide="{{ $d }}"
                aria-label="Go to slide {{ $d + 1 }}"
            ></button>
        @endfor
    </div>
    @endif
</div>

<script nonce="{{ csp_nonce() }}">
(function() {
    var idx = 0, total = {{ $slideCount }};
    var slides = document.querySelectorAll('.banner-slide');
    if (total <= 1) return;
    var timer = setInterval(function() { move(1); }, 6000);

    function move(d) { idx = (idx + d + total) % total; apply(); }
    function go(i) {
        idx = i;
        clearInterval(timer);
        timer = setInterval(function() { move(1); }, 6000);
        apply();
    }
    var prevBtn = document.querySelector('.banner-btn.prev');
    var nextBtn = document.querySelector('.banner-btn.next');
    if (prevBtn) prevBtn.addEventListener('click', function() { move(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function() { move(1); });
    document.querySelectorAll('.banner-dot').forEach(function(d) {
        d.addEventListener('click', function() { go(+d.dataset.slide); });
    });
    function apply() {
        document.getElementById('bannerTrack').style.transform = 'translateX(-' + (idx * 100) + '%)';
        document.querySelectorAll('.banner-dot').forEach(function(d, i) { d.classList.toggle('active', i === idx); });
        slides.forEach(function(s, i) { s.classList.toggle('active', i === idx); });
    }

    // Broken-image fallback: swap imgs carrying data-fallback-class for a placeholder
    document.addEventListener('error', function(e) {
        var img = e.target;
        if (!img || img.tagName !== 'IMG' || !img.dataset.fallbackClass || !img.parentElement) return;
        var parent = img.parentElement; // clearing innerHTML detaches img, so grab it first
        var ph = document.createElement('div');
        ph.className = img.dataset.fallbackClass;
        ph.textContent = img.dataset.fallbackIcon || '🍽️';
        parent.innerHTML = '';
        parent.appendChild(ph);
    }, true);

    // Touch swipe support for mobile
    var touchStartX = null;
    var banner = document.querySelector('.hero-banner');
    if (banner) {
        banner.addEventListener('touchstart', function(e) {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });
        banner.addEventListener('touchend', function(e) {
            if (touchStartX === null) return;
            var dx = e.changedTouches[0].clientX - touchStartX;
            touchStartX = null;
            if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
        }, { passive: true });
    }
})();
</script>
