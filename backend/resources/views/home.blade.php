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
    /* The hero is an inset card at EVERY width — phone margins below, the
       1280px rail plus gutters above. Only the phone was rounded, so the same
       card had trimmed corners on a phone and square ones on a laptop. One
       declaration here keeps them the same shape. */
    border-radius: 1.25rem;
}
/* Mobile: inset rounded container (no border), soft portrait 4:5 */
@media (max-width: 768px) {
    .hero-banner {
        width: auto;
        margin: 0.5rem 1rem 0;
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
/*
 * --hero-photo / --hero-scrim: 0–1 (see docs/HERO_READABILITY_PLAN.md).
 * Keep in lockstep with order-app .home-promo-hero__*
 * photo 1 = full bright; scrim 1 = strong text background.
 * Legacy dim D ⇒ photo=(100-D)/100, scrim=D/100 (identical look).
 */
.banner-slide img,
.banner-slide .banner-video {
    position: absolute;
    inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    opacity: calc(0.45 + 0.55 * var(--hero-photo, 0));
    transform: scale(1.05);
    transition: transform 8s linear;
}
.banner-slide.active img,
.banner-slide.active .banner-video { transform: scale(1); }
.banner-slide .banner-video {
    transform: none;
}
/* Mobile-first overlay (matches order-app .home-promo-hero__*)
 * §7.1: overlay positions the stack; --hero-scrim paints only .banner-copy. */
.banner-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    text-align: center;
    /* Top padding clears the absolutely-positioned open/closed badge
       (top: 1.5rem + ~1.75rem tall). Before this the copy slid underneath it
       and the badge sat on the heading — owner, 2026-08-16. */
    padding: 3.5rem 1.25rem 2.75rem;
    z-index: 2;
    background: none;
    pointer-events: none;
}
.banner-overlay[data-text-position="top"] { justify-content: flex-start; }
.banner-overlay[data-text-position="middle"] { justify-content: center; }
.banner-overlay[data-text-position="bottom"] { justify-content: flex-end; }
.banner-copy {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 100%;
    /* Never taller than the space the overlay gives it. Without this the copy
       grew past the banner and was clipped by .hero-banner{overflow:hidden} —
       the heading lost its first line. */
    max-height: 100%;
    min-height: 0;
    padding: 0.85rem 1rem 1rem;
    border-radius: 16px;
    pointer-events: auto;
    background: linear-gradient(
        180deg,
        rgba(28,20,8, calc(0.22 * var(--hero-scrim, 1))) 0%,
        rgba(28,20,8, calc(0.72 * var(--hero-scrim, 1))) 55%,
        rgba(28,20,8, calc(0.92 * var(--hero-scrim, 1))) 100%
    );
}
/*
 * One background, not three. Driven by the "Shade behind all the text" control
 * in Website Content → Hero (auto / always / off). On auto the shade steps
 * back when the heading or subheading has its own panel, which would otherwise
 * draw a second box around the first — the "too large" look.
 */
.banner-copy[data-copy-scrim="off"] {
    background: none;
    padding: 0;
    border-radius: 0;
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
    /* Shrink to fit rather than wrap to four lines and burst out of the
       banner. Owner chose "words shrink" over "banner grows", 2026-08-16. */
    --hero-title-base: clamp(1.15rem, 6.4vw, 1.7rem);
    font-size: calc(var(--hero-title-base) * var(--hero-el-scale, 1));
    font-weight: var(--hero-el-weight, 800);
    letter-spacing: -0.04em;
    line-height: 1.12;
    color: var(--hero-el-text, #fff);
    margin: 0 0 0.5rem;
    text-shadow: 0 2px 24px rgba(0, 0, 0, 0.4);
}
/* Long headings step down again — length is what drives the wrap. */
.banner-title[data-len="long"]  { --hero-title-base: clamp(1.05rem, 5.4vw, 1.5rem); }
.banner-title[data-len="xlong"] { --hero-title-base: clamp(0.95rem, 4.6vw, 1.3rem); letter-spacing: -0.03em; }
.banner-title em { font-style: normal; color: #F0A96A; }
/*
 * §7.2 non-bar title/subtitle contrast: letter outline + soft halo from
 * --hero-el-bg (no per-line background boxes — those fought line layout).
 */
/* (the letter outline now lives on data-outline — independent of the shape,
   so a box can carry one too. See the hero text styling block below.) */
/* One box hugging the whole text — what glass has always drawn, now available
   in any colour and named as a shape. */
.banner-title[data-bg-shape="hug"],
.banner-sub[data-bg-shape="hug"] {
    display: block;
    width: fit-content;
    max-width: 100%;
    margin-left: auto;
    margin-right: auto;
    box-sizing: border-box;
    padding: 0.4em 0.75em;
    background: var(--hero-el-bg);
    border-radius: 11px;
    text-shadow: none;
    -webkit-text-stroke: 0;
}
/*
 * A separate small background on every line — owner, 2026-08-17: "If there are
 * 2 lines background is like a box. I need separate small background for each
 * line."
 *
 * The box has to be painted on an INLINE box, not the heading: a block or
 * inline-block can only ever draw one rectangle around all the lines. Inline +
 * box-decoration-break:clone repeats the padding, radius and border on every
 * visual line, so it works for soft wraps as well as explicit <br> — which is
 * the case that matters on a phone.
 */
.banner-title[data-bg-shape="line"],
.banner-sub[data-bg-shape="line"] {
    background: none;
    text-shadow: none;
    -webkit-text-stroke: 0;
    /* Padded inline boxes do not grow the line box, so the spacing has to be
       made from the box's own parts or the boxes touch and read as one shape
       again — the very thing this shape exists to avoid. Deriving it from the
       padding and border keeps a gap at any setting; a fixed 1.75 lost it the
       moment a border was switched on. */
    line-height: calc(1.35em + 2 * var(--hero-el-pad-y, 0.12em) + 2 * var(--hero-el-border-w, 0px));
}
.banner-title[data-bg-shape="line"] .hero-title-line,
.banner-sub[data-bg-shape="line"] .hero-sub-line {
    display: inline;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    background: var(--hero-el-bg);
    padding: 0.12em 0.4em;
    border-radius: 10px;
}
/* Frosted glass is a material, not a shape — it layers onto whichever shape
   is painting the surface. */
.banner-title[data-bg-glass="1"][data-bg-shape="hug"],
.banner-sub[data-bg-glass="1"][data-bg-shape="hug"],
.banner-title[data-bg-glass="1"][data-bg-shape="full"],
.banner-sub[data-bg-glass="1"][data-bg-shape="full"] {
    border: 1.5px solid rgba(255, 255, 255, 0.28);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
}
.banner-title[data-bg-glass="1"][data-bg-shape="line"] .hero-title-line,
.banner-sub[data-bg-glass="1"][data-bg-shape="line"] .hero-sub-line {
    border: 1.5px solid rgba(255, 255, 255, 0.28);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
}
.banner-eyebrow[data-bg-glass="1"],
.banner-cta-primary[data-bg-glass="1"],
.banner-cta-secondary[data-bg-glass="1"] {
    background: var(--hero-el-bg);
    border: 1.5px solid rgba(255, 255, 255, 0.28);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: none;
    color: #fff;
}
.banner-cta-primary[data-bg-glass="1"]:hover,
.banner-cta-secondary[data-bg-glass="1"]:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.5);
}
/* ── Hero text styling (owner, 2026-08-17) ──────────────────────────────────
 * Colours, outlines, borders, geometry and type, all driven by --hero-el-*
 * custom properties the renderer only emits when the owner has set them. Every
 * rule below falls back to the value the stylesheet already used, so a slide
 * that has never been styled renders exactly as it did before.
 *
 * The letter outline used to be a SHAPE, which meant choosing a box removed it.
 * data-outline and data-border are now independent of data-bg-shape, so a box
 * can carry an outline and each has its own colour.
 */
.banner-title[data-outline="1"],
.banner-sub[data-outline="1"] {
    -webkit-text-stroke: var(--hero-el-outline-w, 0.02em) var(--hero-el-outline, rgba(28,20,8,0.7));
    paint-order: stroke fill;
    text-shadow:
        calc(-1.75 * var(--hero-el-outline-w, 0.02em)) calc(-1.75 * var(--hero-el-outline-w, 0.02em)) 0 var(--hero-el-outline, rgba(28,20,8,0.7)),
        calc( 1.75 * var(--hero-el-outline-w, 0.02em)) calc(-1.75 * var(--hero-el-outline-w, 0.02em)) 0 var(--hero-el-outline, rgba(28,20,8,0.7)),
        calc(-1.75 * var(--hero-el-outline-w, 0.02em)) calc( 1.75 * var(--hero-el-outline-w, 0.02em)) 0 var(--hero-el-outline, rgba(28,20,8,0.7)),
        calc( 1.75 * var(--hero-el-outline-w, 0.02em)) calc( 1.75 * var(--hero-el-outline-w, 0.02em)) 0 var(--hero-el-outline, rgba(28,20,8,0.7)),
        0 0.08em 0.28em rgba(0, 0, 0, 0.55);
}
/* A box shape clears the stylesheet's own stroke; re-assert the owner's. */
.banner-title[data-bg-shape="hug"][data-outline="1"],
.banner-sub[data-bg-shape="hug"][data-outline="1"],
.banner-title[data-bg-shape="full"][data-outline="1"],
.banner-sub[data-bg-shape="full"][data-outline="1"],
.banner-title[data-bg-shape="line"][data-outline="1"] .hero-title-line,
.banner-sub[data-bg-shape="line"][data-outline="1"] .hero-sub-line {
    -webkit-text-stroke: var(--hero-el-outline-w, 0.02em) var(--hero-el-outline, rgba(28,20,8,0.7));
    paint-order: stroke fill;
}
/* Border on the box itself — separate colour from the letter outline. */
.banner-title[data-border="1"][data-bg-shape="hug"],
.banner-sub[data-border="1"][data-bg-shape="hug"],
.banner-title[data-border="1"][data-bg-shape="full"],
.banner-sub[data-border="1"][data-bg-shape="full"],
.banner-title[data-border="1"][data-bg-shape="line"] .hero-title-line,
.banner-sub[data-border="1"][data-bg-shape="line"] .hero-sub-line {
    border: var(--hero-el-border-w, 1.5px) solid var(--hero-el-border, rgba(255,255,255,0.28));
}
/* Text colour, and a separate colour for the <em> part. */
.banner-title em,
.banner-sub em {
    color: var(--hero-el-em, inherit);
    font-style: inherit;
}
/* Box geometry — roundness and padding. */
.banner-title[data-bg-shape="hug"],
.banner-sub[data-bg-shape="hug"],
.banner-title[data-bg-shape="full"],
.banner-sub[data-bg-shape="full"] {
    border-radius: var(--hero-el-radius, 11px);
    padding: var(--hero-el-pad-y, 0.4em) var(--hero-el-pad-x, 0.75em);
}
.banner-title[data-bg-shape="line"] .hero-title-line,
.banner-sub[data-bg-shape="line"] .hero-sub-line {
    border-radius: var(--hero-el-radius, 10px);
    padding: var(--hero-el-pad-y, 0.12em) var(--hero-el-pad-x, 0.4em);
}
/* Slide-level horizontal alignment for the whole copy stack. */
.banner-overlay[data-text-align="left"] { align-items: flex-start; text-align: left; }
.banner-overlay[data-text-align="right"] { align-items: flex-end; text-align: right; }
.banner-overlay[data-text-align="left"] .banner-copy { align-items: flex-start; }
.banner-overlay[data-text-align="right"] .banner-copy { align-items: flex-end; }
.banner-overlay[data-text-align="left"] .banner-title[data-bg-shape="hug"],
.banner-overlay[data-text-align="left"] .banner-sub[data-bg-shape="hug"] { margin-left: 0; margin-right: auto; }
.banner-overlay[data-text-align="right"] .banner-title[data-bg-shape="hug"],
.banner-overlay[data-text-align="right"] .banner-sub[data-bg-shape="hug"] { margin-left: auto; margin-right: 0; }

/* Full-width bar stays on the heading/paragraph (intentional rectangle). */
.banner-title[data-bg-shape="full"],
.banner-sub[data-bg-shape="full"] {
    display: block;
    align-self: stretch;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: 0.35em 0.55em;
    border-radius: 10px;
    text-shadow: none;
    -webkit-text-stroke: 0;
    background: var(--hero-el-bg);
}
.banner-eyebrow[data-has-bg="1"],
.banner-cta-primary[data-has-bg="1"],
.banner-cta-secondary[data-has-bg="1"] {
    background: var(--hero-el-bg);
}
.banner-sub {
    --hero-sub-base: clamp(0.72rem, 3.2vw, 0.8rem);
    font-size: calc(var(--hero-sub-base) * var(--hero-el-scale, 1));
    color: var(--hero-el-text, rgba(255, 255, 255, 0.78));
    margin: 0 0 1.25rem;
    font-weight: var(--hero-el-weight, 400);
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
    /* Hero stays inside the shared 1280px rail (not full-bleed) */
    .hero-banner {
        width: min(
            calc(var(--desktop-content-max, 1280px) - 2 * var(--desktop-page-gutter, 2rem)),
            calc(100% - 2 * var(--desktop-page-gutter, 2rem))
        );
        max-width: calc(var(--desktop-content-max, 1280px) - 2 * var(--desktop-page-gutter, 2rem));
        margin-inline: auto;
        box-sizing: border-box;
        height: min(78vh, 760px);
        min-height: 560px;
    }
    .banner-slide img,
    .banner-slide .banner-video {
        opacity: calc(0.62 + 0.38 * var(--hero-photo, 0));
    }
    .banner-overlay {
        align-items: center;
        justify-content: flex-end;
        text-align: center;
        padding: 4rem clamp(2.5rem, 8vw, 7rem) 4.5rem;
        background: none;
    }
    .banner-overlay[data-text-position="top"] { justify-content: flex-start; }
    .banner-overlay[data-text-position="middle"] { justify-content: center; }
    .banner-overlay[data-text-position="bottom"] { justify-content: flex-end; }
    .banner-copy {
        /* Wider than before so big desktop titles keep their intentional <br> lines
           (was 720px — long first lines soft-wrapped into a 3rd visual line). */
        max-width: min(980px, 94vw);
        padding: 1.25rem 1.5rem 1.4rem;
        background: linear-gradient(
            180deg,
            rgba(28, 20, 8, calc(0.12 * var(--hero-scrim, 1))) 0%,
            rgba(28, 20, 8, calc(0.45 * var(--hero-scrim, 1))) 45%,
            rgba(14, 10, 4, calc(0.88 * var(--hero-scrim, 1))) 100%
        );
    }
    .banner-eyebrow {
        font-size: 0.78rem;
        padding: 0.4rem 1rem;
        margin-bottom: 1.35rem;
        animation: banner-fade-up 0.7s ease both;
    }
    .banner-title {
        --hero-title-base: clamp(2.55rem, 3.8vw, 3.65rem);
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        margin-bottom: 1rem;
        animation: banner-fade-up 0.75s ease 0.06s both;
    }
    /* Long headings step down on desktop too — same bands as the phone. */
    .banner-title[data-len="long"]  { --hero-title-base: clamp(2.1rem, 3.1vw, 3rem); }
    .banner-title[data-len="xlong"] { --hero-title-base: clamp(1.75rem, 2.6vw, 2.5rem); }
    /* Each CMS <br> segment stays one line on desktop (mobile may still soft-wrap). */
    .banner-title .hero-title-line {
        white-space: nowrap;
    }
    .banner-sub {
        --hero-sub-base: 1.15rem;
        max-width: 560px;
        margin-left: auto;
        margin-right: auto;
        margin-bottom: 2rem;
        color: var(--hero-el-text, rgba(255, 248, 240, 0.82));
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
/* ── Hero motion (owner, 2026-08-17) ────────────────────────────────────────
 * Text arrivals and background movement, all opt-in per slide. --hero-speed is
 * a multiplier (0.5 calm … 2 brisk) and --hero-stagger is the per-line/word
 * delay, so one set of keyframes serves every speed.
 *
 * Everything here is switched off wholesale under prefers-reduced-motion at the
 * bottom of this block. A viewer who has asked their device for less motion has
 * asked everyone, and that is not the owner's setting to overrule.
 */
@keyframes hero-fade-up   { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes hero-zoom-in   { from { opacity: 0; transform: scale(0.9); }      to { opacity: 1; transform: none; } }
@keyframes hero-photo-zoom { from { transform: scale(1); } to { transform: scale(1.12); } }
@keyframes hero-photo-pan  { from { transform: scale(1.1) translateX(-2%); } to { transform: scale(1.1) translateX(2%); } }
@keyframes hero-box-glow  { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
@keyframes hero-box-drift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes hero-box-sheen { 0% { background-position: -150% 0; } 100% { background-position: 250% 0; } }

/*
 * Motion is now a property of each PART, not of the slide — owner, 2026-08-17:
 * "Setting that can be separated make it separate for each part." The selectors
 * therefore hang off the element rather than the overlay.
 *
 * An element can only carry one `animation` property, and an entrance and a
 * looping box effect both want it. Naming the entrance in a custom property
 * lets the box rules compose the two instead of one silently beating the other
 * on specificity — which is what happened first time round: choosing Glow with
 * the one-box shape did nothing at all.
 */
.banner-title[data-anim="fade"],
.banner-sub[data-anim="fade"] { --hero-entrance: hero-fade-up; }
.banner-title[data-anim="zoom"],
.banner-sub[data-anim="zoom"] { --hero-entrance: hero-zoom-in; }
.banner-title[data-anim="line"] .hero-title-line,
.banner-sub[data-anim="line"] .hero-sub-line,
.banner-title[data-anim="word"] .hero-word,
.banner-sub[data-anim="word"] .hero-word { --hero-entrance: hero-fade-up; }

.banner-title[data-anim="fade"],
.banner-sub[data-anim="fade"],
.banner-title[data-anim="zoom"],
.banner-sub[data-anim="zoom"] {
    animation: var(--hero-entrance, none) calc(0.75s / var(--hero-speed, 1)) ease both;
}
.banner-sub[data-anim="fade"],
.banner-sub[data-anim="zoom"] {
    animation-delay: calc(0.12s / var(--hero-speed, 1));
}

/*
 * Line by line and word by word stagger off an index the renderer stamps on
 * each part, so the delay is pure CSS — no per-slide JavaScript, and it keeps
 * working when the text rewraps at a different width.
 */
.banner-title[data-anim="line"] .hero-title-line,
.banner-sub[data-anim="line"] .hero-sub-line,
.banner-title[data-anim="word"] .hero-word,
.banner-sub[data-anim="word"] .hero-word {
    display: inline-block;
    animation: var(--hero-entrance, none) calc(0.6s / var(--hero-speed, 1)) ease both;
}
.banner-title[data-anim="line"] .hero-title-line,
.banner-sub[data-anim="line"] .hero-sub-line {
    animation-delay: calc(var(--hero-line-i, 0) * var(--hero-stagger, 90ms) / var(--hero-speed, 1));
}
.banner-title[data-anim="word"] .hero-word,
.banner-sub[data-anim="word"] .hero-word {
    animation-delay: calc(var(--hero-word-i, 0) * var(--hero-stagger, 90ms) / var(--hero-speed, 1));
}
/*
 * inline-block would break the per-line background, which needs inline runs to
 * clone their box onto every visual line. Keep the run inline and let the words
 * inside it carry the motion instead.
 */
.banner-title[data-anim="line"][data-bg-shape="line"] .hero-title-line,
.banner-sub[data-anim="line"][data-bg-shape="line"] .hero-sub-line {
    display: inline;
}

/* "None" has to actively stop the stylesheet's own long-standing fade, which
   is declared unconditionally on these elements. */
.banner-eyebrow[data-anim="none"],
.banner-title[data-anim="none"],
.banner-sub[data-anim="none"],
.banner-ctas[data-anim="none"] {
    animation: none;
}

/* Background motion on the coloured boxes — composed with the entrance above. */
/* [data-has-bg] is not decoration — it lifts this above the entrance rule,
   which is one selector more specific and would otherwise win outright. */
.banner-title[data-box-anim="glow"][data-has-bg],
.banner-sub[data-box-anim="glow"][data-has-bg] {
    animation:
        var(--hero-entrance, none) calc(0.75s / var(--hero-speed, 1)) ease both,
        hero-box-glow calc(3.2s / var(--hero-speed, 1)) ease-in-out infinite;
}
.banner-title[data-box-anim="glow"] .hero-title-line,
.banner-sub[data-box-anim="glow"] .hero-sub-line {
    animation:
        var(--hero-entrance, none) calc(0.6s / var(--hero-speed, 1)) ease both,
        hero-box-glow calc(3.2s / var(--hero-speed, 1)) ease-in-out infinite;
}
/* Drift needs somewhere to travel, so the fill is stretched wider than the box. */
.banner-title[data-box-anim="drift"][data-has-bg],
.banner-sub[data-box-anim="drift"][data-has-bg] {
    background-size: 300% 100%;
    animation:
        var(--hero-entrance, none) calc(0.75s / var(--hero-speed, 1)) ease both,
        hero-box-drift calc(9s / var(--hero-speed, 1)) ease-in-out infinite;
}
.banner-title[data-box-anim="drift"] .hero-title-line,
.banner-sub[data-box-anim="drift"] .hero-sub-line {
    background-size: 300% 100%;
    animation:
        var(--hero-entrance, none) calc(0.6s / var(--hero-speed, 1)) ease both,
        hero-box-drift calc(9s / var(--hero-speed, 1)) ease-in-out infinite;
}
.banner-title[data-box-anim="sheen"][data-bg-shape="hug"],
.banner-title[data-box-anim="sheen"][data-bg-shape="full"],
.banner-sub[data-box-anim="sheen"][data-bg-shape="hug"],
.banner-sub[data-box-anim="sheen"][data-bg-shape="full"] {
    background-image: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.35) 45%, transparent 70%), var(--hero-el-bg, none);
    background-size: 220% 100%, auto;
    background-repeat: no-repeat;
    animation:
        var(--hero-entrance, none) calc(0.75s / var(--hero-speed, 1)) ease both,
        hero-box-sheen calc(5s / var(--hero-speed, 1)) linear infinite;
}
.banner-title[data-box-anim="sheen"] .hero-title-line,
.banner-sub[data-box-anim="sheen"] .hero-sub-line {
    background-image: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.35) 45%, transparent 70%), var(--hero-el-bg, none);
    background-size: 220% 100%, auto;
    background-repeat: no-repeat;
    animation:
        var(--hero-entrance, none) calc(0.6s / var(--hero-speed, 1)) ease both,
        hero-box-sheen calc(5s / var(--hero-speed, 1)) linear infinite;
}

/* Alignment is per part too, so a short heading can sit left while the
   subheading stays centred. */
.banner-copy [data-align="left"]  { align-self: flex-start; text-align: left; }
.banner-copy [data-align="center"] { align-self: center; text-align: center; }
.banner-copy [data-align="right"] { align-self: flex-end; text-align: right; }
.banner-copy .banner-title[data-align="left"][data-bg-shape="hug"],
.banner-copy .banner-sub[data-align="left"][data-bg-shape="hug"] { margin-left: 0; margin-right: auto; }
.banner-copy .banner-title[data-align="right"][data-bg-shape="hug"],
.banner-copy .banner-sub[data-align="right"][data-bg-shape="hug"] { margin-left: auto; margin-right: 0; }

/* Photo motion. */
/* The photo has its own tempo: --hero-photo-speed, falling back to the text
   speed for slides saved before the two were split. A drifting background and
   an arriving heading rarely want the same pace. */
.banner-slide[data-photo-anim="zoom"] img,
.banner-slide[data-photo-anim="zoom"] .banner-video {
    animation: hero-photo-zoom calc(18s / var(--hero-photo-speed, var(--hero-speed, 1))) ease-in-out infinite alternate;
}
.banner-slide[data-photo-anim="pan"] img,
.banner-slide[data-photo-anim="pan"] .banner-video {
    animation: hero-photo-pan calc(22s / var(--hero-photo-speed, var(--hero-speed, 1))) ease-in-out infinite alternate;
}

@media (prefers-reduced-motion: reduce) {
    .banner-eyebrow[data-anim],
    .banner-title[data-anim],
    .banner-sub[data-anim],
    .banner-ctas[data-anim],
    .banner-title .hero-title-line,
    .banner-sub .hero-sub-line,
    .hero-word,
    .banner-title[data-box-anim],
    .banner-sub[data-box-anim],
    .banner-title[data-box-anim] .hero-title-line,
    .banner-sub[data-box-anim] .hero-sub-line,
    .banner-slide[data-photo-anim] img,
    .banner-slide[data-photo-anim] .banner-video {
        animation: none !important;
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
@media (min-width: 769px) {
    .trust-inner {
        max-width: var(--desktop-content-max, 1280px);
        width: 100%;
        margin-inline: auto;
        padding-inline: var(--desktop-page-gutter, 2rem);
        box-sizing: border-box;
    }
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
@media (min-width: 769px) {
    .section {
        padding-left: 0;
        padding-right: 0;
    }
    .section-inner {
        max-width: var(--desktop-content-max, 1280px);
        width: 100%;
        margin-inline: auto;
        padding-inline: var(--desktop-page-gutter, 2rem);
        box-sizing: border-box;
    }
}
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
@media (min-width: 769px) {
    .proof-strip {
        padding-left: 0;
        padding-right: 0;
    }
    .proof-inner {
        max-width: min(780px, var(--desktop-content-max, 1280px));
        width: 100%;
        margin-inline: auto;
        padding-inline: var(--desktop-page-gutter, 2rem);
        box-sizing: border-box;
    }
}
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
@media (min-width: 769px) {
    .cta-band {
        padding-left: 0;
        padding-right: 0;
    }
    .cta-band-inner {
        max-width: min(600px, var(--desktop-content-max, 1280px));
        width: 100%;
        margin-inline: auto;
        padding-inline: var(--desktop-page-gutter, 2rem);
        box-sizing: border-box;
    }
}
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
        $draftHomeBlocks = app()->bound('content.draft_overrides')
            ? \App\Domains\Content\Blocks\DraftPageBlockHydrator::forAppPage(
                app('content.draft_overrides'),
                'website',
            )
            : null;
        $allHomeBlocks = $draftHomeBlocks
            ?? \App\Domains\Content\Blocks\PageBlockRepository::forPage('website');
    } catch (\Throwable $e) {
        $allHomeBlocks = collect();
    }

    // Customer Surface Builder: Home slot only — no automatic insertion of trust/events/etc.
    // Header/footer chrome is owned by layout.blade.php via HomeChromeResolver.
    $homeBlocksDesktop = \App\Domains\Content\Blocks\PageBlockRepository::forSurface(
        'website', 'desktop', 'home', $allHomeBlocks, true,
    );
    $homeBlocksMobile = \App\Domains\Content\Blocks\PageBlockRepository::forSurface(
        'website', 'mobile', 'home', $allHomeBlocks, true,
    );
    // Merge unique by id preserving desktop order, then append mobile-only — render
    // with device visibility classes when a block is only on one device.
    $merged = collect();
    foreach ($homeBlocksDesktop as $b) {
        $merged[$b->id ?: spl_object_id($b)] = $b;
    }
    foreach ($homeBlocksMobile as $b) {
        $key = $b->id ?: spl_object_id($b);
        if (! isset($merged[$key])) {
            $merged[$key] = $b;
        }
    }
    $homeBlocks = $merged->values();

    $namedHomePartials = [
        'greeting', 'prayer_bar', 'hero', 'announcement', 'service_availability',
        'opening_status', 'stat_chips', 'mode_cards', 'specials', 'featured',
        'categories', 'trust_strip', 'proof', 'reviews', 'reorder_strip', 'cta',
        'location', 'events_band', 'office_orders', 'brand_footer',
    ];
@endphp

@if($homeBlocks->isNotEmpty())
    @foreach($homeBlocks as $homeBlock)
        @php
            $sectionId = $homeBlock->block_type;
            $settings = $homeBlock->resolvedSettings();
            $showDesk = \App\Domains\Content\Blocks\BlockDeviceSettings::showDesktop($settings)
                && \App\Domains\Content\Blocks\BlockDeviceSettings::placementDesktop($settings) === 'home';
            $showMob = \App\Domains\Content\Blocks\BlockDeviceSettings::showMobile($settings)
                && \App\Domains\Content\Blocks\BlockDeviceSettings::placementMobile($settings) === 'home';
            if (! $showDesk && ! $showMob) {
                continue;
            }
            $deviceClass = '';
            if ($showDesk && ! $showMob) {
                $deviceClass = ' home-block--desktop-only';
            } elseif ($showMob && ! $showDesk) {
                $deviceClass = ' home-block--mobile-only';
            }
        @endphp

        @if(!\App\Domains\Content\Blocks\BlockTypeRegistry::isKnown($sectionId))
            @continue
        @endif

        {{-- Header/footer/bottom_nav owned elsewhere --}}
        @if(in_array($sectionId, ['site_footer', 'bottom_nav'], true))
            @continue
        @endif

        @if($sectionId === 'prayer_bar')
            <div class="{{ trim($deviceClass) }}" data-home-block="prayer_bar">
                @include('partials.home.prayer-home')
            </div>
            @continue
        @endif

        @if($sectionId === 'hero' || $sectionId === 'promo_carousel')
            <div class="{{ trim($deviceClass) }}" data-home-block="hero">
                @include('partials.home.hero')
            </div>
            @continue
        @endif

        @if(\App\Domains\Content\Blocks\GenericBlockPresenter::isGeneric($sectionId))
            @php
                $blockSettings = \App\Domains\Content\Blocks\GenericBlockPresenter::sanitizeSettings(
                    $sectionId,
                    $settings,
                );
                $blockIsEmpty = \App\Domains\Content\Blocks\GenericBlockPresenter::isEmpty($sectionId, $blockSettings);
                // Deleted media still has media_id — resolve before wrapping so we
                // never emit an empty data-home-block attribute.
                if (! $blockIsEmpty && $sectionId === 'image') {
                    $blockIsEmpty = \App\Domains\Content\Blocks\GenericBlockPresenter::resolveImage(
                        \App\Domains\Content\Blocks\GenericBlockPresenter::mediaId($blockSettings)
                    ) === null;
                } elseif (! $blockIsEmpty && $sectionId === 'video') {
                    $blockIsEmpty = \App\Domains\Content\Blocks\GenericBlockPresenter::resolveVideo(
                        \App\Domains\Content\Blocks\GenericBlockPresenter::mediaId($blockSettings)
                    ) === null;
                } elseif (! $blockIsEmpty && $sectionId === 'image_text') {
                    $hasImg = \App\Domains\Content\Blocks\GenericBlockPresenter::resolveImage(
                        \App\Domains\Content\Blocks\GenericBlockPresenter::mediaId($blockSettings)
                    ) !== null;
                    $hasCopy = trim(strip_tags((string) ($blockSettings['heading'] ?? ''))) !== ''
                        || trim(strip_tags((string) ($blockSettings['body'] ?? ''))) !== '';
                    $blockIsEmpty = ! $hasImg && ! $hasCopy;
                }
                $genericPartial = 'partials.home.'.str_replace('_', '-', $sectionId);
            @endphp
            @unless($blockIsEmpty)
                @php
                    $stripeIndex = $stripe;
                    if ($sectionId !== 'divider') {
                        $stripe++;
                    }
                @endphp
                <div class="{{ trim($deviceClass) }}" data-home-block="{{ $sectionId }}">
                    @include($genericPartial, ['blockSettings' => $blockSettings, 'stripeIndex' => $stripeIndex])
                </div>
            @endunless
            @continue
        @endif

        @if(!in_array($sectionId, $namedHomePartials, true))
            @continue
        @endif

        @if($sectionId === 'specials' && $homeOffers->count() === 0 && $todaysSpecials->count() === 0)
            @continue
        @endif

        @php
            $partial = $sectionId === 'prayer_bar' ? 'prayer-home' : str_replace('_', '-', $sectionId);
            $stripeIndex = $stripe;
            if (! in_array($sectionId, ['divider', 'opening_status', 'announcement'], true)) {
                $stripe++;
            }
        @endphp
        <div class="{{ trim($deviceClass) }}" data-home-block="{{ $sectionId }}">
            @include('partials.home.'.$partial, ['stripeIndex' => $stripeIndex])
        </div>
    @endforeach
@endif

@endsection
