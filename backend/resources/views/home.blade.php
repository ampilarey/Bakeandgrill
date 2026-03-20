@extends('layout')

@section('title', 'Bake & Grill – Dhivehi Breakfast & Artisan Baking in Malé')
@section('description', 'Real food, proper char, baked fresh at 5am daily. Order Dhivehi hedhikaa, artisan pastries and grills online. Fast delivery across Malé.')

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
@media (max-width: 768px) { .hero-banner { height: 420px; } }

.banner-track {
    display: flex;
    height: 100%;
    transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
}
.banner-slide {
    min-width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}
.banner-slide img {
    position: absolute;
    inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    opacity: 0.45;
    transform: scale(1.05);
    transition: transform 8s linear;
}
.banner-slide.active img { transform: scale(1); }
.banner-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    padding: 3rem 10%;
    z-index: 2;
    background: linear-gradient(
        90deg,
        rgba(28,20,8,0.88) 0%,
        rgba(28,20,8,0.55) 60%,
        rgba(28,20,8,0.12) 100%
    );
}
@media (max-width: 768px) {
    .banner-overlay {
        align-items: center;
        text-align: center;
        padding: 2rem 1.5rem;
        background: linear-gradient(180deg, rgba(28,20,8,0.3) 0%, rgba(28,20,8,0.88) 100%);
        justify-content: flex-end;
        padding-bottom: 3rem;
    }
}

.banner-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(212,129,58,0.22);
    border: 1px solid rgba(212,129,58,0.4);
    color: #F0A96A;
    padding: 0.3rem 0.875rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 1.125rem;
}
.banner-title {
    font-size: 3.5rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.08;
    color: white;
    margin-bottom: 0.875rem;
    text-shadow: 0 2px 24px rgba(0,0,0,0.4);
    max-width: 600px;
}
.banner-title em { font-style: normal; color: #F0A96A; }
.banner-sub {
    font-size: 1.05rem;
    color: rgba(255,255,255,0.72);
    margin-bottom: 2rem;
    font-weight: 400;
    max-width: 480px;
    line-height: 1.6;
}
.banner-ctas {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
}
.banner-cta-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.85rem 1.75rem;
    background: var(--amber);
    color: white;
    border-radius: 11px;
    font-weight: 700;
    font-size: 0.975rem;
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
    gap: 0.4rem;
    padding: 0.85rem 1.5rem;
    background: rgba(255,255,255,0.1);
    border: 1.5px solid rgba(255,255,255,0.28);
    backdrop-filter: blur(6px);
    color: white;
    border-radius: 11px;
    font-weight: 600;
    font-size: 0.975rem;
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
    padding: 0.4rem 1rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
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
    .hero-status { top: 1rem; right: 1rem; font-size: 0.72rem; padding: 0.35rem 0.75rem; }
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
@media (max-width: 768px) { .banner-btn { display: none; } }

.banner-dots {
    position: absolute;
    bottom: 1.5rem;
    left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px; z-index: 10;
}
.banner-dot {
    width: 6px; height: 6px; border-radius: 99px;
    background: rgba(255,255,255,0.3);
    transition: all 0.3s; cursor: pointer;
}
.banner-dot.active { width: 24px; background: var(--amber); }

/* Mobile hero adjustments */
@media (max-width: 768px) {
    .banner-title { font-size: 2rem; max-width: 100%; }
    .banner-sub   { font-size: 0.9rem; max-width: 100%; }
    .banner-cta-primary, .banner-cta-secondary { width: 100%; justify-content: center; }
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
    divide-x: 1px solid var(--border);
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

/* Copper badge accent */
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
    $heroSlides = [];
    for ($i = 1; $i <= 3; $i++) {
        $raw   = \App\Models\SiteSetting::get("hero_slide_{$i}", '{}');
        $slide = json_decode($raw, true) ?: [];
        if (!empty($slide['title'])) {
            $heroSlides[] = $slide;
        }
    }
    $slideCount = max(count($heroSlides), 1);

    $trustItems  = json_decode(\App\Models\SiteSetting::get('trust_items',  '[]'), true) ?: [];
    $categories  = json_decode(\App\Models\SiteSetting::get('homepage_categories', '[]'), true) ?: [];

    $proofStat    = \App\Models\SiteSetting::get('proof_stat',   '500+');
    $proofLabel   = \App\Models\SiteSetting::get('proof_label',  'orders delivered in Malé every week — and counting.');
    $proofDetails = json_decode(\App\Models\SiteSetting::get('proof_details', '[]'), true) ?: [];

    $ctaHeadline = \App\Models\SiteSetting::get('cta_band_headline', 'Hungry? <em>Order now.</em>');
    $ctaSubtext  = \App\Models\SiteSetting::get('cta_band_subtext',  'Fresh from our kitchen to your door in 30–45 minutes. No fuss, no wait — just real food.');

    $phone             = \App\Models\SiteSetting::get('business_phone',    '+960 912 0011');
    $phoneTel          = 'tel:' . preg_replace('/[^+\d]/', '', $phone);
    $waLink            = \App\Models\SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011');
    $viberLink         = \App\Models\SiteSetting::get('business_viber',    'viber://chat?number=9609120011');
    $mapsUrl           = \App\Models\SiteSetting::get('business_maps_url', 'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives');
    $address           = \App\Models\SiteSetting::get('business_address',  'Kalaafaanu Hingun, Malé, Maldives');
    $landmark          = \App\Models\SiteSetting::get('business_landmark', 'Near H. Sahara');
    $deliveryTime      = \App\Models\SiteSetting::get('delivery_time',      '30–45 min');
    $deliveryThreshold = \App\Models\SiteSetting::get('delivery_threshold', 'MVR 200');
    $waOrderLink       = $waLink . (str_contains($waLink, '?') ? '&' : '?') . 'text=Hi%2C+I%27d+like+to+place+an+order';
@endphp

{{-- ══════════════════════════════════════════════════════════
     HERO CAROUSEL
══════════════════════════════════════════════════════════ --}}
<div class="hero-banner">

    {{-- Open/Closed status badge --}}
    @if($isOpen)
        <div class="hero-status open">
            <span class="hero-status-dot"></span>
            We're open
            @if($todayHours) · Closes {{ $todayHours['close'] }}@endif
        </div>
    @else
        <div class="hero-status closed">
            <span class="hero-status-dot"></span>
            Closed now
            @if($todayHours) · Opens {{ $todayHours['open'] }}@endif
        </div>
    @endif

    <div class="banner-track" id="bannerTrack">
        @foreach($heroSlides as $sIdx => $slide)
        <div class="banner-slide {{ $sIdx === 0 ? 'active' : '' }}" style="background:#1C1408;">
            @if(!empty($slide['image']))
                <img src="{{ $slide['image'] }}" loading="{{ $sIdx === 0 ? 'eager' : 'lazy' }}" alt="{{ \App\Models\SiteSetting::get('site_name', 'Bake & Grill') }}">
            @endif
            <div class="banner-overlay">
                @if(!empty($slide['eyebrow']))
                    <span class="banner-eyebrow">{{ $slide['eyebrow'] }}</span>
                @endif
                <h2 class="banner-title">{!! $slide['title'] !!}</h2>
                @if(!empty($slide['subtitle']))
                    <p class="banner-sub">{{ $slide['subtitle'] }}</p>
                @endif
                <div class="banner-ctas">
                    <a href="{{ $slide['cta_url']  ?? '/order/' }}" class="banner-cta-primary">{{ $slide['cta_text']  ?? 'Order Now →' }}</a>
                    <a href="{{ $slide['cta2_url'] ?? '/order/menu'   }}" class="banner-cta-secondary">{{ $slide['cta2_text'] ?? 'View Menu' }}</a>
                </div>
            </div>
        </div>
        @endforeach
    </div>

    <button class="banner-btn prev" onclick="moveBanner(-1)" aria-label="Previous slide">‹</button>
    <button class="banner-btn next" onclick="moveBanner(1)"  aria-label="Next slide">›</button>

    <div class="banner-dots" id="bannerDots">
        @for($d = 0; $d < $slideCount; $d++)
            <div class="banner-dot {{ $d === 0 ? 'active' : '' }}" onclick="goBanner({{ $d }})"></div>
        @endfor
    </div>
</div>

<script>
(function() {
    var idx = 0, total = {{ $slideCount }};
    var slides = document.querySelectorAll('.banner-slide');
    var timer = setInterval(function() { move(1); }, 6000);

    function move(d) { idx = (idx + d + total) % total; apply(); }
    window.moveBanner = move;
    window.goBanner = function(i) {
        idx = i;
        clearInterval(timer);
        timer = setInterval(function() { move(1); }, 6000);
        apply();
    };
    function apply() {
        document.getElementById('bannerTrack').style.transform = 'translateX(-' + (idx * 100) + '%)';
        document.querySelectorAll('.banner-dot').forEach(function(d, i) { d.classList.toggle('active', i === idx); });
        slides.forEach(function(s, i) { s.classList.toggle('active', i === idx); });
    }
})();
</script>


{{-- ══════════════════════════════════════════════════════════
     TRUST MICRO-STRIP
══════════════════════════════════════════════════════════ --}}
<div class="trust-strip">
    <div class="trust-inner">
        @foreach($trustItems as $ti)
        <div class="trust-item">
            <div class="trust-icon-wrap">{{ $ti['icon'] ?? '' }}</div>
            <div class="trust-text">
                <strong>{{ $ti['heading'] ?? '' }}</strong>
                <span>{{ $ti['subtext'] ?? '' }}</span>
            </div>
        </div>
        @endforeach
    </div>
</div>


{{-- ══════════════════════════════════════════════════════════
     SIGNATURE CATEGORIES
══════════════════════════════════════════════════════════ --}}
<section class="section alt">
    <div class="section-inner">
        <div class="section-header">
            <span class="section-eyebrow">What we're known for</span>
            <h2 class="section-title">Made for Malé</h2>
            <p class="section-sub">Four things we do properly, every single day.</p>
        </div>
        <div class="categories-grid">
            @foreach($categories as $cat)
            <a href="{{ $cat['link'] ?? '/order/menu' }}" class="cat-card">
                <div class="cat-img">
                    @if(!empty($cat['image_url']))
                        <img src="{{ $cat['image_url'] }}"
                             alt="{{ $cat['name'] ?? '' }}"
                             onerror="this.parentElement.innerHTML='<div class=cat-img-placeholder>{{ $cat['icon'] ?? '🍽️' }}</div>'">
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


{{-- ══════════════════════════════════════════════════════════
     FEATURED ITEMS
══════════════════════════════════════════════════════════ --}}
<section class="section">
    <div class="section-inner">
        <div class="section-header">
            <span class="section-eyebrow">
                @if($bestSellers->count() > 0 && $bestSellers->max('order_items_count') > 0)
                    🔥 Most Ordered
                @else
                    ⭐ Handpicked
                @endif
            </span>
            <h2 class="section-title">
                @if($bestSellers->count() > 0 && $bestSellers->max('order_items_count') > 0)
                    Best Sellers
                @else
                    Featured Items
                @endif
            </h2>
            <p class="section-sub">The dishes our regulars order on repeat.</p>
        </div>

        <div class="products-grid">
            @foreach($featuredItems as $item)
                    @php
                    $isBestSeller = isset($item->order_items_count) && $item->order_items_count > 0;
                    @endphp
                <div class="product-card">
                    <div class="product-img">
                        @if($item->image_url ?? null)
                            @php
                                $path   = trim(preg_replace('#^https?://[^/]+#', '', $item->image_url ?? ''), '/');
                                $imgUrl = (str_starts_with($path, 'images/cafe/') && is_file(public_path($path)))
                                    ? asset($path)
                                    : ($item->image_url ?? '');
                            @endphp
                            <img src="{{ $imgUrl }}" alt="{{ $item->name }}" loading="lazy"
                                 onerror="this.parentElement.innerHTML='<div class=\'product-img-placeholder\'>🍽️</div>'">
                        @else
                            <div class="product-img-placeholder">🍽️</div>
                        @endif

                        @if($isBestSeller)
                            <span class="product-badge badge-bestseller">🔥 Best Seller</span>
                        @else
                            <span class="product-badge badge-fresh">Fresh Daily</span>
                        @endif
                    </div>

                    <div class="product-body">
                        @if($item->category?->name)
                            <div class="product-cat">{{ $item->category->name }}</div>
                        @endif
                        <div class="product-name">{{ $item->name }}</div>
                        @if($item->description ?? null)
                            <div class="product-desc">{{ Str::limit($item->description, 60) }}</div>
                        @endif
                        <div class="product-price-row">
                            <span class="product-currency">MVR</span>
                            <span class="product-price">{{ number_format($item->base_price, 2) }}</span>
                        </div>

                        <a href="/order/menu" class="add-btn">Order Now →</a>
                    </div>
                </div>
            @endforeach
        </div>

        <div class="view-all">
            <a href="/order/menu" class="btn-primary">Browse Full Menu →</a>
        </div>
    </div>
</section>


{{-- ══════════════════════════════════════════════════════════
     SOCIAL PROOF
══════════════════════════════════════════════════════════ --}}
<section class="proof-strip">
    <div class="proof-inner">
        <div class="proof-eyebrow">Loved by Malé</div>
        <div class="proof-stat">{!! $proofStat !!}</div>
        <p class="proof-label">{{ $proofLabel }}</p>
        <div class="proof-details">
            @foreach($proofDetails as $pd)
            <div class="proof-detail">
                <strong>{{ $pd['value'] ?? '' }}</strong>
                <span>{{ $pd['label'] ?? '' }}</span>
            </div>
            @endforeach
        </div>
    </div>
</section>


{{-- ══════════════════════════════════════════════════════════
     LOCATION & CONVENIENCE
══════════════════════════════════════════════════════════ --}}
<section class="section alt">
    <div class="section-inner">
        <div class="section-header">
            <span class="section-eyebrow">Find us</span>
            <h2 class="section-title">Visit or Order</h2>
            <p class="section-sub">Come in or stay in — we've got you covered either way.</p>
        </div>
        <div class="location-grid">

            {{-- Visit Us card --}}
            <div class="loc-card">
                <div class="loc-card-accent"></div>
                <div class="loc-card-icon">📍</div>
                <h3>Visit Us</h3>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        {{ $address }}
                        <small>{{ $landmark }}</small>
                    </div>
                </div>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        @if($isOpen)
                            <span style="color:#195C36;font-weight:700;">Open now</span>
                            @if($todayHours) · Closes {{ $todayHours['close'] }} @endif
                        @else
                            <span style="color:#8C1C0E;font-weight:700;">Closed now</span>
                            @if($todayHours) · Opens {{ $todayHours['open'] }} @endif
                        @endif
                        <small><a href="/hours" style="color:var(--amber);">See full schedule →</a></small>
                    </div>
                </div>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        {{ $phone }}
                        <small>Call to reserve or ask about custom orders</small>
                    </div>
                </div>

                <hr class="loc-divider">

                <p class="chat-label">Chat with us</p>
                <div class="chat-block">
                    <a href="{{ $waLink }}" target="_blank" rel="noopener" class="chat-btn chat-btn-wa">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        WhatsApp
                    </a>
                    <a href="{{ $viberLink }}" class="chat-btn chat-btn-viber">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 0C5.7.3 1.2 4.8.9 10.5c-.2 3.4.8 6.5 2.7 8.9L2.2 24l4.8-1.4c1.4.7 3 1.1 4.7 1.1 6.1 0 11.1-5 11.1-11.1S17.9 0 11.8 0h-.4zm.5 2c5.1 0 9.1 4 9.1 9.1s-4 9.1-9.1 9.1c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .9.9-2.9-.2-.3C3.7 15.2 3.1 13.1 3.1 11 3.1 5.9 7.2 2 12.1 2h-.2zm-.8 3.2c-.3 0-.8.1-1.2.5C9.5 6.3 8.8 7 8.8 8.5s1 3 1.2 3.2c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.1 1.8-.1.5-.3 1.6-1.5 1.8-2.3.2-.7.1-1.3-.1-1.5-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.2c-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.2-.2.4-.4.5-.6.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6-.1-.1-.8-1.9-1.1-2.7-.2-.5-.5-.5-.7-.5z"/></svg>
                        Viber
                    </a>
                </div>

                <div class="loc-ctas" style="margin-top:1rem;">
                    <a href="{{ $mapsUrl }}" target="_blank" rel="noopener" class="loc-cta-outline">
                        📍 Get Directions
                    </a>
                    <a href="{{ $phoneTel }}" class="loc-cta-outline">
                        📞 Call Us
                    </a>
                </div>
            </div>

            {{-- Order Delivery card --}}
            <div class="loc-card">
                <div class="loc-card-accent"></div>
                <div class="loc-card-icon">🛵</div>
                <h3>Order Delivery</h3>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        Delivery across all of Malé
                        <small>We come to you — no exceptions within the city</small>
                    </div>
                </div>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        {{ $deliveryTime }} average delivery time
                        <small>Hot food at your door, not a cold box</small>
                    </div>
                </div>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        Free delivery on orders over {{ $deliveryThreshold }}
                        <small>BML online payment or cash on delivery</small>
                    </div>
                </div>

                <hr class="loc-divider">

                <p class="chat-label">Order via app or chat</p>
                <div class="chat-block">
                    <a href="{{ $waOrderLink }}" target="_blank" rel="noopener" class="chat-btn chat-btn-wa">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        Order via WhatsApp
                    </a>
                    <a href="{{ $viberLink }}" class="chat-btn chat-btn-viber">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 0C5.7.3 1.2 4.8.9 10.5c-.2 3.4.8 6.5 2.7 8.9L2.2 24l4.8-1.4c1.4.7 3 1.1 4.7 1.1 6.1 0 11.1-5 11.1-11.1S17.9 0 11.8 0h-.4zm.5 2c5.1 0 9.1 4 9.1 9.1s-4 9.1-9.1 9.1c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .9.9-2.9-.2-.3C3.7 15.2 3.1 13.1 3.1 11 3.1 5.9 7.2 2 12.1 2h-.2zm-.8 3.2c-.3 0-.8.1-1.2.5C9.5 6.3 8.8 7 8.8 8.5s1 3 1.2 3.2c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.1 1.8-.1.5-.3 1.6-1.5 1.8-2.3.2-.7.1-1.3-.1-1.5-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.2c-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.2-.2.4-.4.5-.6.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6-.1-.1-.8-1.9-1.1-2.7-.2-.5-.5-.5-.7-.5z"/></svg>
                        Order via Viber
                    </a>
                </div>

                <div class="loc-ctas" style="margin-top:1rem;">
                    <a href="/order/" class="loc-cta-primary">
                        🛒 Order Online Now
                    </a>
                    <a href="/order/menu" class="loc-cta-outline">
                        🍽️ View Menu
                    </a>
                </div>
            </div>

        </div>
    </div>
</section>


{{-- ══════════════════════════════════════════════════════════
     FINAL CTA BAND
══════════════════════════════════════════════════════════ --}}
<section class="cta-band">
    <div class="cta-band-inner">
        <h2>{!! $ctaHeadline !!}</h2>
        <p>{{ $ctaSubtext }}</p>
        <div class="cta-band-btns">
            <a href="/order/" class="btn-primary">🛒 Order Now</a>
            <a href="/order/menu"   class="btn-outline">Browse Menu</a>
        </div>
    </div>
</section>

@endsection
