@extends('layout')

@php
    $homeMetaTitle = content('meta_title', 'Bake & Grill – Dhivehi Breakfast & Artisan Baking in Malé');
    $homeMetaDesc  = content('meta_description', 'Real food, proper char, baked fresh at 5am daily. Order Dhivehi hedhikaa, artisan pastries and grills online. Fast delivery across Malé.');

    if (!function_exists('normalize_public_menu_link')) {
        function normalize_public_menu_link(?string $link): string
        {
            $link = trim((string) ($link ?: '/order/menu'));
            if ($link === '/menu') {
                return '/order/menu';
            }
            if (str_starts_with($link, '/menu?') || str_starts_with($link, '/menu/')) {
                return '/order' . $link;
            }

            return safe_public_url($link) ?? '#';
        }
    }
@endphp
@section('title', $homeMetaTitle)
@section('description', $homeMetaDesc)

@section('styles')
<style>

/* ══════════════════════════════════════════════════════════
   HERO CAROUSEL
══════════════════════════════════════════════════════════ */
.hero-banner {
    position: relative;
    height: 600px;
    overflow: hidden;
    background: var(--inverse-section-bg);
}
/* Mobile: inset rounded container (no border), soft portrait 4:5 */
@media (max-width: 768px) {
    .hero-banner {
        width: auto;
        margin: 0.5rem 1rem 0;
        border-radius: 1.25rem;
        border: none;
        height: min(68vh, calc((100vw - 2rem) * 1.25), 500px);
        height: min(68dvh, calc((100vw - 2rem) * 1.25), 500px);
        min-height: 340px;
    }
}

.banner-track {
    display: flex;
    height: 100%;
    transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
}
.banner-slide {
    flex: 0 0 100%;
    min-width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}
/* --hero-dim: 0–1 (from slide.dim 0–100). 1 = current dark wash; 0 = bright. */
.banner-slide img,
.banner-slide .banner-video {
    position: absolute;
    inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    opacity: calc(1 - 0.55 * var(--hero-dim, 1));
    transform: scale(1.05);
    transition: transform 8s linear;
}
.banner-slide.active img,
.banner-slide.active .banner-video { transform: scale(1); }
.banner-slide .banner-video {
    transform: none;
}
/* Mobile-first overlay (matches order-app .home-promo-hero__*) */
.banner-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    text-align: center;
    padding: 1.75rem 1.25rem 2.75rem;
    z-index: 2;
    background: linear-gradient(
        180deg,
        rgba(28,20,8, calc(0.22 * var(--hero-dim, 1))) 0%,
        rgba(28,20,8, calc(0.72 * var(--hero-dim, 1))) 55%,
        rgba(28,20,8, calc(0.92 * var(--hero-dim, 1))) 100%
    );
}

/* Eyebrow / title / sub — keep in lockstep with order-app .home-promo-hero__* */
.banner-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(212, 129, 58, 0.22);
    border: 1px solid rgba(212, 129, 58, 0.4);
    color: #F0A96A;
    padding: 0.3rem 0.875rem;
    border-radius: 999px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 0.75rem;
}
.banner-title {
    font-size: 1.7rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.08;
    color: #fff;
    margin: 0 0 0.5rem;
    text-shadow: 0 2px 24px rgba(0, 0, 0, 0.4);
}
.banner-title em { font-style: normal; color: #F0A96A; }
.banner-sub {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.78);
    margin: 0 0 1.25rem;
    font-weight: 400;
    line-height: 1.55;
}
.banner-ctas {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
}
.banner-cta-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: auto;
    max-width: 100%;
    padding: 0.7rem 1.35rem;
    background: var(--amber);
    color: white;
    border-radius: 11px;
    font-weight: 700;
    font-size: 0.875rem;
    transition: all 0.2s;
    box-shadow: 0 4px 18px rgba(212,129,58,0.4);
}
.banner-cta-primary:hover {
    background: var(--amber-hover);
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(212,129,58,0.5);
}
.banner-cta-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: auto;
    max-width: 100%;
    padding: 0.7rem 1.35rem;
    background: rgba(255,255,255,0.1);
    border: 1.5px solid rgba(255,255,255,0.28);
    backdrop-filter: blur(6px);
    color: white;
    border-radius: 11px;
    font-weight: 600;
    font-size: 0.875rem;
    transition: all 0.2s;
}
.banner-cta-secondary:hover {
    background: rgba(255,255,255,0.2);
    border-color: rgba(255,255,255,0.5);
}

/* Status badge inside hero */
.hero-status {
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
    z-index: 10;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}
.hero-status.open {
    background: rgba(29,94,56,0.85);
    color: #6EE7A0;
    border: 1px solid rgba(110,231,160,0.25);
}
.hero-status.closed {
    background: rgba(120,20,15,0.85);
    color: #FCA5A5;
    border: 1px solid rgba(252,165,165,0.25);
}
.hero-status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
}
.open .hero-status-dot { background: #4ADE80; box-shadow: 0 0 6px #4ADE80; animation: pulse-dot 2s infinite; }
.closed .hero-status-dot { background: #FCA5A5; }
@keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}
@media (max-width: 768px) {
    .hero-status { top: 0.85rem; right: 0.85rem; }
}

/* Carousel nav */
.banner-btn {
    position: absolute;
    top: 50%; transform: translateY(-50%);
    z-index: 10;
    background: rgba(255,255,255,0.1);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255,255,255,0.2);
    color: white;
    width: 48px; height: 48px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.25rem;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.2s;
    -webkit-tap-highlight-color: transparent;
}
.banner-btn:hover { background: rgba(255,255,255,0.22); }
.banner-btn.prev { left: 1.5rem; }
.banner-btn.next { right: 1.5rem; }
/* Expand hit area to 44px without growing the visible circle */
.banner-btn::before {
    content: '';
    position: absolute;
    inset: -4px;
}
/* Phones: swipe + dots only — hide chevrons */
@media (max-width: 768px) {
    .banner-btn { display: none; }
}

.banner-dots {
    position: absolute;
    bottom: 1rem;
    left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px; z-index: 10;
}
.banner-dot {
    width: 6px; height: 6px; border-radius: 99px;
    background: rgba(255,255,255,0.3);
    transition: all 0.3s; cursor: pointer;
    /* Expand tap target without changing visible size */
    position: relative;
    /* Reset native button chrome — dots are <button> for a11y */
    border: 0;
    padding: 0;
    appearance: none;
    -webkit-appearance: none;
    font: inherit;
    color: inherit;
}
.banner-dot::before {
    content: '';
    position: absolute;
    inset: -12px -10px;
}
.banner-dot.active { width: 24px; background: var(--amber); }
@media (max-width: 768px) {
    .banner-dots { bottom: 0.85rem; gap: 8px; }
    .banner-dot {
        width: 8px;
        height: 8px;
        background: rgba(255, 255, 255, 0.45);
    }
    .banner-dot.active { width: 26px; }
}

/* ── Desktop-only hero / banner polish (mobile unchanged) ───────── */
@media (min-width: 769px) {
    .hero-banner {
        height: min(78vh, 760px);
        min-height: 560px;
    }
    .banner-slide img,
    .banner-slide .banner-video {
        opacity: calc(1 - 0.38 * var(--hero-dim, 1));
    }
    .banner-overlay {
        align-items: center;
        justify-content: flex-end;
        text-align: center;
        padding: 4rem clamp(2.5rem, 8vw, 7rem) 4.5rem;
        background: linear-gradient(
            180deg,
            rgba(28, 20, 8, calc(0.12 * var(--hero-dim, 1))) 0%,
            rgba(28, 20, 8, calc(0.45 * var(--hero-dim, 1))) 45%,
            rgba(14, 10, 4, calc(0.88 * var(--hero-dim, 1))) 100%
        );
    }
    .banner-overlay > * {
        max-width: 720px;
    }
    .banner-eyebrow {
        font-size: 0.78rem;
        padding: 0.4rem 1rem;
        margin-bottom: 1.35rem;
        animation: banner-fade-up 0.7s ease both;
    }
    .banner-title {
        font-size: clamp(2.75rem, 4.5vw, 4.25rem);
        max-width: 800px;
        margin-left: auto;
        margin-right: auto;
        margin-bottom: 1rem;
        animation: banner-fade-up 0.75s ease 0.06s both;
    }
    .banner-sub {
        font-size: 1.15rem;
        max-width: 560px;
        margin-left: auto;
        margin-right: auto;
        margin-bottom: 2rem;
        color: rgba(255, 248, 240, 0.82);
        animation: banner-fade-up 0.8s ease 0.12s both;
    }
    .banner-ctas {
        flex-direction: column;
        align-items: center;
        gap: 0.9rem;
        animation: banner-fade-up 0.85s ease 0.18s both;
    }
    .banner-cta-primary,
    .banner-cta-secondary {
        min-height: 52px;
        padding: 0.95rem 1.9rem;
        font-size: 1.05rem;
        border-radius: 12px;
    }
    .banner-btn {
        width: 52px;
        height: 52px;
        background: rgba(20, 14, 8, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.28);
    }
    .banner-btn.prev { left: clamp(1.25rem, 2.5vw, 2.5rem); }
    .banner-btn.next { right: clamp(1.25rem, 2.5vw, 2.5rem); }
    .banner-dots {
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        gap: 8px;
    }
    .banner-dot {
        width: 8px;
        height: 8px;
        background: rgba(255, 255, 255, 0.35);
    }
    .banner-dot.active {
        width: 28px;
        background: var(--amber);
    }
    .hero-status {
        top: 1.75rem;
        right: clamp(1.5rem, 3vw, 2.5rem);
        font-size: 0.78rem;
        padding: 0.45rem 0.9rem;
    }
}
@media (min-width: 1200px) {
    .hero-banner {
        height: min(82vh, 820px);
    }
}
@keyframes banner-fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
    .banner-eyebrow,
    .banner-title,
    .banner-sub,
    .banner-ctas { animation: none; }
}

/* ══════════════════════════════════════════════════════════
   TRUST MICRO-STRIP
══════════════════════════════════════════════════════════ */
.trust-strip {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0;
}
.trust-inner {
    max-width: 1280px; margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
}
.trust-item {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 1.375rem 1.5rem;
    border-right: 1px solid var(--border);
    transition: background 0.15s;
}
.trust-item:last-child { border-right: none; }
.trust-item:hover { background: var(--amber-light); }
.trust-icon-wrap {
    width: 40px; height: 40px;
    background: var(--amber-light);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.2rem;
    flex-shrink: 0;
}
.trust-text strong { display: block; font-size: 0.875rem; font-weight: 700; color: var(--dark); line-height: 1.3; }
.trust-text span   { font-size: 0.75rem; color: var(--muted); }
@media (max-width: 900px) {
    .trust-inner { grid-template-columns: repeat(2, 1fr); }
    .trust-item:nth-child(2) { border-right: none; }
}
@media (max-width: 480px) {
    .trust-inner { grid-template-columns: 1fr 1fr; }
    .trust-item  { padding: 1rem 1rem; }
}

/* ══════════════════════════════════════════════════════════
   SECTION BASE
══════════════════════════════════════════════════════════ */
.section { padding: 5rem 2rem; }
.section.alt { background: #FDFAF5; }
.section-inner { max-width: 1280px; margin: 0 auto; }
.section-header { margin-bottom: 2.75rem; }
.section-eyebrow {
    display: inline-block;
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--amber); margin-bottom: 0.5rem;
}
.section-title {
    font-size: 2.25rem; font-weight: 800;
    letter-spacing: -0.035em; color: var(--dark);
    line-height: 1.15;
}
.section-sub {
    font-size: 1rem; color: var(--muted);
    margin-top: 0.625rem; max-width: 540px; line-height: 1.7;
}
@media (max-width: 600px) {
    .section { padding: 3.5rem 1.25rem; }
    .section-title { font-size: 1.75rem; }
}

/* ══════════════════════════════════════════════════════════
   SIGNATURE CATEGORIES
══════════════════════════════════════════════════════════ */
.categories-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1.25rem;
}
@media (max-width: 900px) { .categories-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .categories-grid { grid-template-columns: 1fr 1fr; gap: 0.875rem; } }

.cat-card {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    transition: all 0.25s;
    cursor: pointer;
    display: block;
    text-decoration: none;
}
.cat-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 16px 40px rgba(28,20,8,0.12);
    border-color: rgba(212,129,58,0.4);
}
.cat-img {
    height: 180px;
    overflow: hidden;
    background: var(--amber-light);
    position: relative;
}
.cat-img img {
    width: 100%; height: 100%;
    object-fit: cover;
    transition: transform 0.5s;
}
.cat-card:hover .cat-img img { transform: scale(1.08); }
.cat-img-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    font-size: 3rem;
}
.cat-img-placeholder.hedhikaa { background: linear-gradient(145deg, #FEF3E8, #FDDDB4); }
.cat-img-placeholder.pastry   { background: linear-gradient(145deg, #FFF8EE, #FEEBD0); }
.cat-img-placeholder.grill    { background: linear-gradient(145deg, #1C1408, #3D2610); }
.cat-img-placeholder.cake     { background: linear-gradient(145deg, #FFF0F5, #FFDCE8); }
.cat-img-placeholder.grill span { font-size: 2.5rem; }

.cat-body { padding: 1.25rem 1.375rem 1.5rem; }
.cat-label {
    font-size: 0.65rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--amber); margin-bottom: 0.35rem;
}
.cat-name {
    font-size: 1.15rem; font-weight: 800;
    color: var(--dark); margin-bottom: 0.5rem;
    letter-spacing: -0.02em;
}
.cat-hook {
    font-size: 0.85rem; color: var(--muted);
    line-height: 1.5; margin-bottom: 0.875rem;
}
.cat-link {
    font-size: 0.8rem; font-weight: 700;
    color: var(--amber);
    display: inline-flex; align-items: center; gap: 0.25rem;
    transition: gap 0.15s;
}
.cat-card:hover .cat-link { gap: 0.5rem; }
@media (max-width: 480px) {
    .cat-img  { height: 130px; }
    .cat-name { font-size: 1rem; }
    .cat-hook { font-size: 0.78rem; }
}

/* ══════════════════════════════════════════════════════════
   PRODUCT CARDS
══════════════════════════════════════════════════════════ */
.products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    gap: 1.375rem;
}
.product-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    overflow: hidden;
    transition: all 0.25s;
}
.product-card:hover {
    border-color: rgba(212,129,58,0.35);
    box-shadow: 0 14px 42px rgba(28,20,8,0.1);
    transform: translateY(-4px);
}
.product-img {
    position: relative;
    height: 200px;
    overflow: hidden;
    background: linear-gradient(145deg, var(--amber-light), #F7E4C8);
}
.product-img img {
    width: 100%; height: 100%;
    object-fit: cover;
    transition: transform 0.45s;
}
.product-card:hover .product-img img { transform: scale(1.07); }
.product-img-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    font-size: 3.5rem;
}

.product-badge {
    position: absolute; top: 0.75rem; left: 0.75rem;
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    font-size: 0.68rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
}
.badge-bestseller { background: rgba(168,88,28,0.9); color: #FDDDB4; }
.badge-fresh      { background: rgba(20,90,50,0.88); color: #BBF7D0; }
.badge-mto        { background: rgba(45,122,79,0.9); color: white; }
.badge-new        { background: rgba(79,70,229,0.88); color: #E0E7FF; }

/* Offers / Today's Specials — circular ZUS cards (match order app) */
.specials-scroll {
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
}
.special-card {
    position: relative;
    flex: 0 0 160px;
    scroll-snap-align: start;
    background: transparent;
    border: none;
    border-radius: 0;
    overflow: visible;
    text-decoration: none;
    color: inherit;
    transition: transform 0.25s;
    display: flex;
    flex-direction: column;
    align-items: stretch;
}
.special-card:hover {
    border-color: transparent;
    box-shadow: none;
    transform: translateY(-2px);
}
.special-card .product-img--circle {
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    overflow: hidden; /* tall placeholder logo must not stretch the box into an oval */
    background: linear-gradient(145deg, rgba(212,129,58,0.18), #F7E4C8 55%, rgba(253,221,180,0.65));
}
/* Real product photos only — do not apply cover-fill to the brand logo inside the placeholder. */
.special-card .product-img--circle > img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
}
.special-card .product-img-placeholder--brand {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    background: transparent;
}
.special-card .product-img-placeholder__logo {
    width: auto;
    height: auto;
    max-width: 56%;
    max-height: 56%;
    object-fit: contain;
    border-radius: 0;
}
.special-card .product-img-placeholder__mono {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    color: var(--amber);
}
.special-card .product-body {
    padding: 0.75rem 0.25rem 0.5rem;
    text-align: center;
}
/* Badge sits on the card (sibling of the circle) so overflow:hidden on the image cannot clip it. */
.special-card .special-badge-stack {
    position: absolute;
    top: 0.4rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    width: max-content;
    max-width: 90%;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
}
.special-badge {
    background: var(--amber);
    color: white;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
}
.special-card .special-badge-stack .special-badge {
    position: static;
}
.price-was {
    font-size: 0.8rem;
    color: var(--muted);
    text-decoration: line-through;
    margin-left: 0.35rem;
}
.price-sale {
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--amber);
}

.product-body { padding: 1.25rem 1.375rem 1.5rem; }
.product-cat {
    font-size: 0.68rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.09em;
    color: var(--amber); margin-bottom: 0.4rem;
}
.product-name {
    font-size: 1.1rem; font-weight: 700;
    color: var(--dark); line-height: 1.3;
    margin-bottom: 0.25rem;
}
.product-desc {
    font-size: 0.8rem; color: var(--muted);
    line-height: 1.5; margin-bottom: 0.875rem;
}
.product-price-row {
    display: flex; align-items: baseline;
    gap: 0.3rem; margin-bottom: 1rem;
}
.product-price {
    font-size: 1.45rem; font-weight: 800;
    letter-spacing: -0.03em; color: var(--dark);
}
.product-currency {
    font-size: 0.82rem; font-weight: 600;
    color: var(--muted);
}
.add-btn {
    width: 100%; padding: 0.725rem;
    background: var(--amber); color: white;
    border: none; border-radius: 11px;
    font-weight: 700; font-size: 0.9rem;
    cursor: pointer; transition: all 0.15s; font-family: inherit;
    letter-spacing: 0.01em;
}
.add-btn:hover { background: var(--amber-hover); transform: translateY(-1px); }
.add-btn:disabled { background: var(--border); color: var(--muted); cursor: not-allowed; transform: none; }
.add-btn.preorder { background: #92611E; }
.add-btn.preorder:hover { background: #7A4E18; }
.view-all { text-align: center; margin-top: 3rem; }

/* ══════════════════════════════════════════════════════════
   SOCIAL PROOF / STAT
══════════════════════════════════════════════════════════ */
.proof-strip {
    background: var(--inverse-section-bg);
    padding: 5rem 2rem;
    text-align: center;
}
.proof-inner { max-width: 780px; margin: 0 auto; }
.proof-eyebrow {
    display: inline-block;
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: rgba(240,169,106,0.8);
    margin-bottom: 1.5rem;
}
.proof-stat {
    font-size: 5.5rem; font-weight: 800;
    letter-spacing: -0.05em;
    color: white;
    line-height: 1;
    margin-bottom: 0.75rem;
}
.proof-stat span { color: var(--amber); }
@media (max-width: 600px) { .proof-stat { font-size: 3.5rem; } }
.proof-label {
    font-size: 1.2rem; color: rgba(255,255,255,0.65);
    font-weight: 400; line-height: 1.6;
    margin-bottom: 2rem;
}
.proof-details {
    display: flex; justify-content: center;
    gap: 2.5rem; flex-wrap: wrap;
}
.proof-detail {
    display: flex; flex-direction: column;
    align-items: center; gap: 0.25rem;
}
.proof-detail strong {
    font-size: 1.5rem; font-weight: 800;
    color: white; letter-spacing: -0.03em;
}
.proof-detail span { font-size: 0.8rem; color: rgba(255,255,255,0.45); }

/* ══════════════════════════════════════════════════════════
   LOCATION & CONVENIENCE
══════════════════════════════════════════════════════════ */
.location-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
}
@media (max-width: 700px) { .location-grid { grid-template-columns: 1fr; } }

.loc-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 2.25rem 2rem;
    position: relative;
    overflow: hidden;
    transition: all 0.2s;
}
.loc-card:hover {
    border-color: rgba(212,129,58,0.3);
    box-shadow: 0 12px 40px rgba(28,20,8,0.08);
    transform: translateY(-3px);
}
.loc-card-accent {
    position: absolute; top: 0; left: 0; right: 0;
    height: 4px;
    background: linear-gradient(90deg, var(--amber), #E9953B);
    border-radius: 20px 20px 0 0;
}
.loc-card-icon {
    width: 48px; height: 48px;
    background: var(--amber-light);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem;
    margin-bottom: 1.25rem;
}
.loc-card h3 {
    font-size: 1.25rem; font-weight: 800;
    color: var(--dark); letter-spacing: -0.025em;
    margin-bottom: 1.25rem;
}
.loc-detail-row {
    display: flex; align-items: flex-start;
    gap: 0.75rem; margin-bottom: 0.875rem;
}
.loc-detail-dot {
    width: 6px; height: 6px;
    background: var(--amber); border-radius: 50%;
    flex-shrink: 0; margin-top: 0.55rem;
}
.loc-detail-text { font-size: 0.9rem; color: var(--text); line-height: 1.5; }
.loc-detail-text small { color: var(--muted); font-size: 0.8rem; display: block; }
.loc-divider {
    border: none; border-top: 1px solid var(--border);
    margin: 1.5rem 0;
}
.loc-ctas { display: flex; gap: 0.625rem; flex-wrap: wrap; }
.loc-cta-primary {
    flex: 1; min-width: 120px;
    display: inline-flex; align-items: center; justify-content: center;
    gap: 0.375rem;
    padding: 0.75rem 1rem;
    background: var(--amber); color: white;
    border-radius: 10px; font-weight: 700; font-size: 0.875rem;
    transition: all 0.15s;
}
.loc-cta-primary:hover { background: var(--amber-hover); transform: translateY(-1px); }
.loc-cta-outline {
    flex: 1; min-width: 120px;
    display: inline-flex; align-items: center; justify-content: center;
    gap: 0.375rem;
    padding: 0.75rem 1rem;
    border: 1.5px solid var(--border); color: var(--text);
    border-radius: 10px; font-weight: 600; font-size: 0.875rem;
    transition: all 0.15s; background: transparent;
}
.loc-cta-outline:hover { border-color: var(--amber); color: var(--amber); background: var(--amber-light); }

/* Chat with us component */
.chat-block {
    display: flex; gap: 0.625rem; flex-wrap: wrap;
    margin-top: 0.875rem;
}
.chat-btn {
    flex: 1; min-width: 110px;
    display: inline-flex; align-items: center; justify-content: center;
    gap: 0.4rem;
    padding: 0.65rem 0.875rem;
    border-radius: 9px; font-weight: 700; font-size: 0.8rem;
    transition: all 0.15s;
}
.chat-btn-wa {
    background: #25D366; color: white;
}
.chat-btn-wa:hover { background: #1bba58; transform: translateY(-1px); }
.chat-btn-viber {
    background: #7360F2; color: white;
}
.chat-btn-viber:hover { background: #5E4CD6; transform: translateY(-1px); }
.chat-label {
    font-size: 0.72rem; color: var(--muted);
    margin-bottom: 0.5rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.07em;
}

/* ══════════════════════════════════════════════════════════
   FINAL CTA BAND
══════════════════════════════════════════════════════════ */
.cta-band {
    background: linear-gradient(135deg, #FDFAF5 0%, #FEF3E8 100%);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 5rem 2rem;
    text-align: center;
}
.cta-band-inner { max-width: 600px; margin: 0 auto; }
.cta-band h2 {
    font-size: 2.5rem; font-weight: 800;
    letter-spacing: -0.04em; color: var(--dark);
    line-height: 1.15; margin-bottom: 0.875rem;
}
.cta-band h2 em { font-style: normal; color: var(--amber); }
.cta-band p {
    font-size: 1.05rem; color: var(--muted);
    line-height: 1.7; margin-bottom: 2rem;
}
.cta-band-btns {
    display: flex; gap: 0.875rem;
    justify-content: center; flex-wrap: wrap;
}
.btn-primary {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.95rem 2.25rem;
    background: var(--amber); color: white;
    border-radius: 12px; font-weight: 700; font-size: 1rem;
    transition: all 0.2s;
    box-shadow: 0 4px 18px var(--amber-glow);
}
.btn-primary:hover { background: var(--amber-hover); transform: translateY(-2px); box-shadow: 0 6px 24px var(--amber-glow); }
.btn-outline {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.95rem 2.25rem;
    border: 2px solid var(--border); color: var(--text);
    border-radius: 12px; font-weight: 600; font-size: 1rem;
    transition: all 0.2s; background: transparent;
}
.btn-outline:hover { border-color: var(--amber); color: var(--amber); background: var(--amber-light); }
@media (max-width: 600px) {
    .cta-band h2 { font-size: 1.875rem; }
    .btn-primary, .btn-outline { width: 100%; justify-content: center; }
}

/* ─── Dark mode: fix light-only section backgrounds & readability ─── */
[data-theme="dark"] .section.alt {
    background: var(--surface);
}
[data-theme="dark"] .cta-band {
    background: linear-gradient(135deg, var(--surface) 0%, var(--bg) 100%);
}
[data-theme="dark"] .product-img {
    background: linear-gradient(145deg, var(--amber-light), var(--surface));
}
[data-theme="dark"] .cat-img-placeholder.hedhikaa,
[data-theme="dark"] .cat-img-placeholder.pastry,
[data-theme="dark"] .cat-img-placeholder.cake {
    filter: brightness(0.85);
}

</style>
@endsection

@section('content')
@php
    $heroSlides = \App\Domains\Content\HeroSlides::resolve(static fn (string $key, mixed $default) => content($key, $default));
    // When no slides are configured, we render 1 fallback slide — dots/nav should reflect that.
    $slideCount = count($heroSlides) > 0 ? count($heroSlides) : 1;

    $trustItems  = json_decode(content('trust_items',  '[]'), true) ?: [];
    $categories  = json_decode(content('homepage_categories', '[]'), true) ?: [];

    $proofStat    = content('proof_stat',   '500+');
    $proofLabel   = content('proof_label',  'orders delivered in Malé every week — and counting.');
    $proofDetails = json_decode(content('proof_details', '[]'), true) ?: [];

    $ctaHeadline = content('cta_band_headline', 'Hungry? <em>Order now.</em>');
    $ctaSubtext  = content('cta_band_subtext',  'Fresh from our kitchen to your door. Real food, properly made — order online in under a minute.');

    $phone             = content('business_phone',    '+960 912 0011');
    $phoneTel          = 'tel:' . preg_replace('/[^+\d]/', '', $phone);
    $waLink            = safe_public_url((string) content('business_whatsapp', 'https://wa.me/9609120011'))
        ?? 'https://wa.me/9609120011';
    $viberLink         = safe_public_url((string) content('business_viber', '')) ?? '';
    $mapsUrl           = safe_public_url((string) content('business_maps_url', 'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives'))
        ?? 'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives';
    $address           = content('business_address',  'Kalaafaanu Hingun, Malé, Maldives');
    $landmark          = content('business_landmark', 'Near H. Sahara');
    $deliveryTime      = content('delivery_time',      '30–45 min');
    $deliveryThreshold = content('delivery_threshold', 'MVR 200');
    $waOrderLink       = $waLink . (str_contains($waLink, '?') ? '&' : '?') . 'text=Hi%2C+I%27d+like+to+place+an+order';

    // Homepage section copy — managed in Admin → Settings → Website Settings → Homepage
    $homeCategoriesEyebrow = content('home_categories_eyebrow', "What we're known for");
    $homeCategoriesTitle   = content('home_categories_title',   'Made for Malé');
    $homeCategoriesSubtitle= content('home_categories_subtitle','Four things we do properly, every single day.');
    $homeFeaturedEyebrowBs = content('home_featured_eyebrow_bestseller', '🔥 Most Ordered');
    $homeFeaturedEyebrowHp = content('home_featured_eyebrow_handpicked', '⭐ Handpicked');
    $homeFeaturedTitleBs   = content('home_featured_title_bestseller',   'Best Sellers');
    $homeFeaturedTitleHp   = content('home_featured_title_handpicked',   'Featured Items');
    $homeFeaturedSubtitle  = content('home_featured_subtitle',  'The dishes our regulars order on repeat.');
    $homeLocationEyebrow   = content('home_location_eyebrow',   'Find us');
    $homeLocationTitle     = content('home_location_title',     'Visit or Order');
    $homeLocationSubtitle  = content('home_location_subtitle',  "Come in or stay in — we've got you covered either way.");
    $homeProofEyebrow      = content('home_proof_eyebrow',      'Loved by Malé');
    $homeDeliveryTagline   = content('home_delivery_tagline',   'Delivery across all of Malé');
    $homeDeliverySubtitle  = content('home_delivery_subtitle',  'We come to you — no exceptions within the city');
    $homeDeliveryQualityLine  = content('home_delivery_quality_line',  'Hot food at your door, not a cold box');
    $homeDeliveryPaymentLine  = content('home_delivery_payment_line',  'Secure BML online payment at checkout');
    $homeOpenBadgeText        = content('home_open_badge_text',   "We're open");
    $homeClosedBadgeText      = content('home_closed_badge_text', 'Closed now');
    $homeVisitCardTitle       = content('home_visit_card_title', 'Visit Us');
    $homeDeliveryCardTitle    = content('home_delivery_card_title', 'Order Delivery');
    $homeChatLabel            = content('home_chat_label', 'Chat with us');
    $homeDirectionsCta        = content('home_directions_cta', 'Get Directions');
    $homeCallCta              = content('home_call_cta', 'Call Us');
    $homeOrderViaAppLabel     = content('home_order_via_app_label', 'Order via app or chat');
    $featuredReviews = \App\Models\Review::query()
        ->where('status', 'approved')
        ->whereNotNull('comment')
        ->where('comment', '!=', '')
        ->with(['customer:id,name', 'item:id,name'])
        ->orderByDesc('rating')
        ->orderByDesc('created_at')
        ->limit(6)
        ->get();
@endphp

{{-- ══════════════════════════════════════════════════════════
     HOME SECTIONS (page_blocks authoritative)
══════════════════════════════════════════════════════════ --}}
@php
    $homeOffers = isset($offers) ? $offers : collect();
    $defaultItemImage = content('default_item_image');
    $stripe = 0;
    try {
        $draftPageBlocks = null;
        if (app()->bound('content.draft_overrides')) {
            $draftOverrides = app('content.draft_overrides');
            $draftPageBlocks = is_array($draftOverrides)
                ? ($draftOverrides['page_blocks']['website']['home'] ?? null)
                : null;
        }
        if (is_array($draftPageBlocks)) {
            $homeBlocks = collect($draftPageBlocks)->map(function ($row) {
                $row = is_array($row) ? $row : [];
                $block = new \App\Models\PageBlock();
                // Preview rows already contain resolved draft settings. Do not
                // let shared_content_id pull the old live shared row.
                $row['shared_content_id'] = null;
                $block->forceFill($row);
                $block->exists = false;

                return $block;
            });
        } else {
            $homeBlocks = \App\Domains\Content\Blocks\PageBlockRepository::forPage('website');
        }
    } catch (\Throwable $e) {
        $homeBlocks = collect();
    }
    $usePageBlocks = $homeBlocks->isNotEmpty();
    // The trust strip is fixed chrome, not a block: it always renders in the
    // hero slot (immediately under the hero when on, in its place when off),
    // exactly like the legacy path below.
    $trustStripRendered = false;
@endphp

@if($usePageBlocks)
    @if(!$homeBlocks->contains(fn ($b) => $b->block_type === 'hero'))
        @include('partials.home.trust-strip')
        @php $trustStripRendered = true; @endphp
    @endif
    @foreach($homeBlocks as $homeBlock)
        @php $sectionId = $homeBlock->block_type; @endphp

        @if($sectionId === 'hero')
            @if($homeBlock->is_enabled)
                @include('partials.home.hero')
            @endif
            @unless($trustStripRendered)
                @include('partials.home.trust-strip')
                @php $trustStripRendered = true; @endphp
            @endunless
            @continue
        @endif

        @if(!$homeBlock->is_enabled)
            @continue
        @endif
        @if(!\App\Domains\Content\Blocks\BlockTypeRegistry::isKnown($sectionId))
            {{-- Unknown types render nothing here; the admin layout editor reports them. --}}
            @continue
        @endif

        @if($sectionId === 'brand_footer')
            {{-- Footer lives in layout.blade.php; block is non-removable for admin safety. --}}
            @continue
        @endif

        {{-- Generic content blocks: settings-driven, may appear many times. --}}
        @if(\App\Domains\Content\Blocks\GenericBlockPresenter::isGeneric($sectionId))
            @php
                $blockSettings = \App\Domains\Content\Blocks\GenericBlockPresenter::sanitizeSettings(
                    $sectionId,
                    $homeBlock->resolvedSettings(),
                );
                $blockIsEmpty = \App\Domains\Content\Blocks\GenericBlockPresenter::isEmpty($sectionId, $blockSettings);
                $genericPartial = 'partials.home.'.str_replace('_', '-', $sectionId);
            @endphp
            @unless($blockIsEmpty)
                @php
                    $stripeIndex = $stripe;
                    // A divider has no background of its own, so it must not
                    // shift the alternating stripe of the sections after it.
                    if ($sectionId !== 'divider') {
                        $stripe++;
                    }
                @endphp
                @include($genericPartial, ['blockSettings' => $blockSettings, 'stripeIndex' => $stripeIndex])
            @endunless
            @continue
        @endif

        @if(!in_array($sectionId, ['specials', 'featured', 'categories', 'proof', 'cta', 'location'], true))
            @continue
        @endif

        @if($sectionId === 'specials' && $homeOffers->count() === 0 && $todaysSpecials->count() === 0)
            @continue
        @endif

        @php
            $stripeIndex = $stripe;
            $stripe++;
        @endphp
        @include('partials.home.'.$sectionId, ['stripeIndex' => $stripeIndex])
    @endforeach
@else
    {{-- No blocks for this page: render the required chrome only, never a
         blank page. The brand footer lives in layout.blade.php; the trust
         strip keeps its historical hero-slot placement. The admin home layout
         editor reports the empty layout loudly. --}}
    @include('partials.home.trust-strip')
@endif


{{-- ══════════════════════════════════════════════════════════
     EVENTS & CATERING
══════════════════════════════════════════════════════════ --}}
@php
    $eventsHeadline = content('events_section_headline', 'Events & Catering');
    $eventsBlurb = content('events_section_blurb', 'Plan office breakfasts, celebrations, and catering trays with a structured quote — not just a same-day order.');
    $eventsBrowseCta = content('events_section_browse_cta', 'Browse catering menu');
    $eventsPlanCta = content('events_section_plan_cta', 'Plan your event');
@endphp
<section class="events-band" style="padding:3.5rem 2rem; background:var(--surface); border-top:1px solid var(--border);">
    <div style="max-width:640px; margin:0 auto; text-align:center;">
        <h2 style="font-size:clamp(1.5rem,3vw,2rem); font-weight:800; color:var(--dark); margin:0 0 0.75rem;">{{ $eventsHeadline }}</h2>
        <p style="font-size:1rem; color:var(--muted); line-height:1.55; margin:0 0 1.5rem;">{{ $eventsBlurb }}</p>
        <div style="display:flex; gap:0.75rem; flex-wrap:wrap; justify-content:center;">
            <a href="/order/catering" class="btn-outline" style="min-height:48px; display:inline-flex; align-items:center; padding:0 1.25rem;">{{ $eventsBrowseCta }}</a>
            <a href="/order/events" class="btn-primary" style="min-height:48px; display:inline-flex; align-items:center; padding:0 1.25rem;">{{ $eventsPlanCta }}</a>
        </div>
    </div>
</section>

@endsection
