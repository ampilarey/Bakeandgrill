@extends('layout')

{{-- A shared category link (/menu/c/...) opens this same full menu at that
     category, with the category's own title, text and picture for the chat's
     link preview (owner, 2026-10-07). --}}
@section('title', !empty($menuShare) ? ($menuShare['name'] . ' – Menu – Bake & Grill') : 'Menu – Bake & Grill')
@section('description', !empty($menuShare)
    ? $menuShare['description']
    : 'The full Bake & Grill menu — Dhivehi hedhikaa, fast food, sweet treats and drinks, freshly made in Malé. Prices in MVR.')
@if(!empty($menuShare['image']))
    @section('og_image', $menuShare['image'])
    @section('og_image_alt', $menuShare['name'] . ' at Bake & Grill')
@endif

@section('styles')
<style>
/* Server-rendered so a crawler — and a phone on weak data at a table — get
   the food before any JavaScript runs. The category rail below enhances it;
   nothing here depends on the rail working.

   The layout deliberately mirrors the order app's menu (apps/online-order-web,
   `cat-rail` + `menu-card-article--zus`): a sticky rail of category thumbnails
   down the left, an image band per section, and borderless cards with round
   photos. Someone who scans the QR code here and then taps through to order
   should not feel they have changed products halfway. */

:root {
    --menu-rail-w: 92px;
    --menu-circle: min(132px, 34vw);
    --menu-sticky: 76px; /* matches html { scroll-padding-top } in the layout */
}

/* Reachable by screen reader and by search engines, drawn nowhere. Not
   display:none, which would take it out of the accessibility tree too. */
.visually-hidden {
    position: absolute;
    width: 1px; height: 1px;
    margin: -1px; padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

/* ── Shell: sticky rail + sections ──────────────────────────────────── */
.menu-shell {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    max-width: 1180px;
    margin: 0 auto;
    /* Small top pad: the hero used to provide this gap. Without it the first
       category band butts straight against the header. */
    padding: 0.75rem 1.25rem 4rem;
}

/* Plain anchor links, so the rail works before JS and keeps working without
   it. The scroll-spy at the bottom of the page only adds the active mark. */
/* The nav sticks; its child scrolls. iOS Safari will not touch-scroll an
   element that is both sticky and the scroller, which went unnoticed while
   the rail was short enough to fit (owner, 2026-09-03: "rail not scrolling"). */
.menu-rail {
    flex: 0 0 var(--menu-rail-w);
    width: var(--menu-rail-w);
    position: sticky;
    top: var(--menu-sticky);
    align-self: flex-start;
    border-right: 1px solid var(--border);
}
.menu-rail-scroll {
    max-height: calc(100dvh - var(--menu-sticky) - 1rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    /* Room under the last entry so it can be scrolled clear of the phone's
       bottom edge; the script above trims max-height to what is on screen. */
    padding: 0.5rem 0 calc(1.5rem + env(safe-area-inset-bottom, 0px));
}
/* ZUS-style entries (owner, 2026-09-03): photo over a short label, air
   between entries, no boxes. Active = brand colour + left bar only. */
.menu-rail-list { display: flex; flex-direction: column; gap: 7px; padding: 0 4px; }
/* Owner, 2026-09-03: "make the cat photo in rail maximum bigger without
   changing the rail size". No side padding on an entry: the photo takes the
   panel's inner width (92px rail → 64px photo, 52px for a sub-category;
   76px phone rail → 60 and 48). */
.menu-rail a {
    display: flex; flex-direction: column; align-items: center;
    gap: 0.35rem;
    padding: 0.55rem 0;
    border-radius: 12px;
    color: var(--muted);
    text-decoration: none;
    text-align: center;
}
.menu-rail a:hover { color: var(--amber); }
/* Main categories only since 2026-10-07 ("keep the main category in the
   rail"): each a tile, its photo filling the top edge to edge over a bold
   name. Offers, Chef's picks and Events are tiles of the same shape. */
.menu-rail-list { position: relative; }
.menu-rail-list > a {
    position: relative; z-index: 1;
    display: flex; flex-direction: column;
    gap: 4px;
    padding: 3px 3px 5px;
    border: 0;
    border-radius: 14px;
    overflow: hidden;
    color: var(--dark);
    /* A soft card (owner, 2026-10-07: "enhance the buttons on the rail ...
       little smaller"): a rounded photo inset over a small bold name. */
    background: var(--surface);
    box-shadow: 0 1px 2px rgba(28, 20, 8, 0.06), 0 4px 10px -6px rgba(28, 20, 8, 0.2);
    transition: color 0.3s ease, background-color 0.3s ease;
}
.menu-rail-list > a .menu-rail-thumb {
    width: 100%; height: auto; aspect-ratio: 4 / 3;
    border-radius: 11px;
}
.menu-rail-list > a .menu-rail-label { font-size: 0.66rem; font-weight: 700; padding: 0 2px; }
/* The chosen tile fills rust, its name in white; the ring glides to it. */
.menu-rail-list > a.is-active { color: #fff; background: var(--amber); box-shadow: 0 6px 14px -6px color-mix(in srgb, var(--amber) 70%, transparent); }
.menu-rail-list > a.is-active .menu-rail-label { font-weight: 800; }
.menu-rail-list > a.is-active:hover { color: #fff; }
/* The tiles slide in one after another when the page opens (owner,
   2026-10-07), from the side the rail sits on. */
@keyframes rail-tile-in-left { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
@keyframes rail-tile-in-right { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
.menu-rail-list > a { animation: rail-tile-in-left 0.42s cubic-bezier(.2,.7,.2,1) both; }
html.rail-right .menu-rail-list > a { animation-name: rail-tile-in-right; }
.menu-rail-list > a:nth-child(2) { animation-delay: 40ms; }
.menu-rail-list > a:nth-child(3) { animation-delay: 80ms; }
.menu-rail-list > a:nth-child(4) { animation-delay: 120ms; }
.menu-rail-list > a:nth-child(5) { animation-delay: 160ms; }
.menu-rail-list > a:nth-child(6) { animation-delay: 200ms; }
.menu-rail-list > a:nth-child(7) { animation-delay: 240ms; }
.menu-rail-list > a:nth-child(8) { animation-delay: 280ms; }
.menu-rail-list > a:nth-child(n+9) { animation-delay: 320ms; }
/* The ring waits for its tile to land. */
@keyframes rail-ring-in { from { opacity: 0; } to { opacity: 1; } }
.menu-rail-pill { animation: rail-ring-in 0.25s ease 0.32s backwards; }
@media (min-width: 769px) { .menu-rail-list > a .menu-rail-label { font-size: 0.72rem; } }
/* The chosen tile's ring glides from one tile to the next (owner,
   2026-10-07: "some animation ... now just appear"). The script moves it;
   without the script the tile's own colour still marks it. */
.menu-rail-pill {
    position: absolute; left: 0; right: 0; top: 0; height: 0;
    border: 2px solid var(--amber); border-radius: 17px;
    pointer-events: none; z-index: 2; opacity: 0;
    transition: transform 0.32s cubic-bezier(.2,.7,.2,1), height 0.32s cubic-bezier(.2,.7,.2,1), opacity 0.2s ease;
}
.menu-rail-pill.is-on { opacity: 1; }
/* Owner, 2026-09-02: bigger picture and text in the rail, same rail width. */
.menu-rail-thumb {
    width: 64px; height: 64px;
    border-radius: 14px;
    object-fit: cover;
    flex-shrink: 0;
}
/* Letter fallback only — an <img> is a replaced element and ignores this. */
/* Cream with the letter or icon in rust: one look for every tile without a
   photo (owner, 2026-10-07: the pastel tiles were not brand colours). */
span.menu-rail-thumb {
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 1.15rem;
    /* Rust thinned into the surface: cream by day, deep brown at night. */
    background: color-mix(in srgb, var(--amber) 14%, var(--surface));
    color: var(--amber);
}
.menu-rail-label {
    font-size: 0.75rem; font-weight: 600; line-height: 1.15;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word; max-width: 100%;
}
/* The count stays in the link's aria-label; no numeral under the photo (ZUS look). */
.menu-rail-count { display: none; }
.menu-rail a.menu-rail-events { font-weight: 700; }
.menu-main { flex: 1; min-width: 0; }

/* ── The pinned banner ──────────────────────────────────────────────────
   Owner, 2026-10-07: "keep the main category in the rail and sub category
   below the banner ... All the time banner and subcategories shows in the
   screen", then "some animation like morphing ... when switch to next sub
   category and next category". One banner for the whole menu, pinned under
   the site header. It changes in place: the photo cross-fades and settles,
   the name rolls in the direction of travel, the button row slides across,
   and a rust highlight glides from button to button. Every move is under a
   third of a second and only transform / opacity, and none of it runs for a
   visitor who asked their device for less motion. */
.mh {
    position: sticky; top: var(--menu-sticky); z-index: 30;
    background: var(--bg);
    padding-top: 0.5rem;
    margin-bottom: 0.25rem;
    box-shadow: 0 10px 12px -12px rgba(28, 20, 8, 0.35);
    --mh-ease: cubic-bezier(.2,.7,.2,1);
}
/* The site header is shorter than --menu-sticky; cover the strip between
   them so dishes do not show above the pinned banner. */
.mh.is-stuck::before {
    content: ""; position: absolute; left: 0; right: 0;
    bottom: 100%; height: var(--menu-sticky);
    background: var(--bg);
}
.mh-banner {
    position: relative; height: 88px; border-radius: 14px; overflow: hidden;
    background: var(--amber-light);
}
.mh-banner::before {
    /* A faint scatter of flames; a photo covers it, so it shows only on a
       section without one. */
    content: ""; position: absolute; inset: 0;
    background: url('/brand/flame-pattern.svg') 0 0 / 120px 120px repeat;
    opacity: 0.12; pointer-events: none;
}
.mh-img {
    position: absolute; inset: -6px;
    background-size: cover; background-position: center;
    opacity: 0; transform: scale(1.06);
    transition: opacity 0.32s ease, transform 0.9s var(--mh-ease);
}
.mh-img.is-on { opacity: 1; transform: scale(1); }
.mh-shade {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(28,20,8,0.72) 0%, rgba(28,20,8,0.28) 60%, rgba(28,20,8,0.1) 100%);
}
.mh-copy {
    position: absolute; inset: 0; z-index: 1;
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0 6.75rem 0 1.1rem; color: #fff;
}
.mh-title { position: relative; height: 2rem; overflow: hidden; flex: none; transition: width 0.32s var(--mh-ease); }
.mh-title span {
    display: block; white-space: nowrap;
    font-size: 1.5rem; font-weight: 800; line-height: 2rem;
    text-shadow: 0 1px 3px rgba(0,0,0,0.4);
}
.mh-title span + span { position: absolute; left: 0; top: 0; }
.mh-count { font-size: 0.8rem; font-weight: 600; opacity: 0.9; white-space: nowrap; }
.mh-actions { position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%); z-index: 3; display: flex; align-items: center; gap: 0.4rem; }
.mh-share[hidden] { display: none; }
.mh-share-btn, .menu-sub-share {
    width: 38px; height: 38px; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 999px; cursor: pointer;
}
.mh-share-btn, .mh-search {
    border: 1.5px solid rgba(255,255,255,0.75);
    background: rgba(28,20,8,0.35); color: #fff;
    -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
}
.mh-actions .share-popover { bottom: auto; top: calc(100% + 0.4rem); left: auto; right: 0; }
/* The banner clips its photo; the popover has to open outside it. */
.mh-banner:has(.share-popover:not([hidden])) { overflow: visible; }

.mh { --mh-bar-h: 56px; }
.mh--room { margin-bottom: calc(0.25rem + var(--mh-bar-h)); }
.mh-under { position: absolute; left: 0; right: 0; top: 100%; background: var(--bg); }
.mh.has-row .mh-under, .mh.has-panel .mh-under { box-shadow: 0 10px 12px -12px rgba(28, 20, 8, 0.35); }
.mh-bar {
    display: flex; align-items: center; gap: 0.5rem; height: var(--mh-bar-h); overflow: hidden;
    transition: height 0.3s var(--mh-ease), opacity 0.24s ease;
}
.mh:not(.has-row) .mh-bar { height: 0; opacity: 0; pointer-events: none; }
.mh-rows { position: relative; flex: 1; min-width: 0; height: 100%; }
.mh-chips {
    position: absolute; inset: 0;
    display: flex; align-items: center; gap: 0.5rem;
    overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain;
    opacity: 0; transform: translateX(28px); pointer-events: none;
    transition: opacity 0.24s ease, transform 0.32s var(--mh-ease);
}
.mh-chips::-webkit-scrollbar { display: none; }
.mh-chips.is-left { transform: translateX(-28px); }
.mh-chips.is-on { opacity: 1; transform: none; pointer-events: auto; }
/* A soft fade on whichever edge has more buttons beyond it. */
.mh-chips.fade-r { -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 40px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 40px), transparent); }
.mh-chips.fade-l { -webkit-mask-image: linear-gradient(90deg, transparent, #000 40px); mask-image: linear-gradient(90deg, transparent, #000 40px); }
.mh-chips.fade-l.fade-r { -webkit-mask-image: linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent); mask-image: linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent); }
.mh-pill {
    position: absolute; left: 0; top: 50%; height: 38px; margin-top: -19px; width: 0;
    border-radius: 999px; background: var(--amber);
    box-shadow: 0 4px 10px -4px color-mix(in srgb, var(--amber) 70%, transparent);
    transition: transform 0.24s var(--mh-ease), width 0.24s var(--mh-ease);
    z-index: 0;
}
.mh-chip {
    position: relative; z-index: 1; flex: none;
    display: inline-flex; align-items: center; height: 38px; padding: 0 0.9rem;
    border: 1px solid var(--border); border-radius: 999px;
    background: var(--surface); color: var(--dark);
    font-size: 0.875rem; font-weight: 700; text-decoration: none; white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.24s, background-color 0.24s, border-color 0.24s;
}
.mh-chip em { font-style: normal; font-weight: 500; font-size: 0.75rem; color: var(--muted); margin-left: 0.4rem; transition: color 0.24s; }
.mh-chip.is-active { background: transparent; border-color: transparent; color: #fff; }
.mh-chip.is-active em { color: #ffe3d0; }
/* Without the script there is no pill; the active button colours itself. */
html:not(.js) .mh-chip.is-active { background: var(--amber); }
.mh-all {
    flex: none; height: 38px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--surface); color: var(--dark);
    display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;
    font: inherit; font-size: 0.875rem; font-weight: 700; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}
.mh-all { padding: 0 0.75rem; }
.mh-all[hidden] { display: none; }
.mh-all.is-new { animation: mh-pop 0.24s var(--mh-ease); }
@keyframes mh-pop { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: none; } }
.mh-search { width: 38px; height: 38px; padding: 0; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.mh-search[aria-expanded="true"], .mh-search.is-on { background: #fff; border-color: #fff; color: var(--amber); }
/* Search needs the script, so does its button. */
html:not(.js) .mh-search { display: none; }
.mh-panel { padding: 0 0 0.6rem; }
.mh-panel[hidden] { display: none; }

/* The All panel: a sheet from the bottom on a phone, a dropdown on a computer. */
.mh-scrim {
    position: fixed; inset: 0; z-index: 905;
    background: rgba(28,20,8,0.35);
    opacity: 0; transition: opacity 0.32s ease;
}
.mh-scrim.is-open { opacity: 1; }
.mh-scrim[hidden], .mh-sheet[hidden] { display: none; }
.mh-sheet {
    position: fixed; z-index: 906; left: 0; right: 0; bottom: 0;
    max-height: 70vh; overflow: auto;
    background: var(--surface); color: var(--dark);
    border-radius: 20px 20px 0 0;
    padding: 0.5rem 1rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
    box-shadow: 0 -10px 30px rgba(28,20,8,0.18);
    transform: translateY(105%);
    transition: transform 0.32s cubic-bezier(.2,.7,.2,1);
}
.mh-sheet.is-open { transform: none; }
.mh-sheet-grab { width: 40px; height: 4px; border-radius: 2px; background: var(--border); margin: 0.25rem auto 0.6rem; }
.mh-sheet-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
.mh-sheet-title { margin: 0; font-size: 1.05rem; font-weight: 800; }
.mh-sheet-count { font-size: 0.8rem; color: var(--muted); }
.mh-sheet-x {
    margin-left: auto; width: 36px; height: 36px; border-radius: 50%;
    border: 0; background: var(--amber-light); color: var(--dark);
    font-size: 1.2rem; cursor: pointer;
}
.mh-sheet-list { list-style: none; margin: 0; padding: 0; }
.mh-sheet-list li { opacity: 0; transform: translateY(6px); transition: opacity 0.24s ease, transform 0.24s cubic-bezier(.2,.7,.2,1); }
.mh-sheet.is-open .mh-sheet-list li { opacity: 1; transform: none; }
.mh-sheet-list button {
    width: 100%; display: flex; align-items: center; gap: 0.6rem;
    padding: 0.85rem 0.35rem; border: 0; border-bottom: 1px solid var(--border);
    background: none; color: inherit; font: inherit; font-size: 0.95rem; font-weight: 700;
    text-align: start; cursor: pointer;
}
.mh-sheet-list button i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.mh-sheet-list button span { margin-inline-start: auto; color: var(--muted); font-weight: 500; font-size: 0.8rem; }
.mh-sheet-list button.is-active { color: var(--amber); }
.mh-sheet-list button.is-active i { background: var(--amber); }
@media (min-width: 769px) {
    .mh-sheet {
        left: auto; right: max(1.25rem, calc((100vw - 1180px) / 2 + 1.25rem)); bottom: auto;
        width: 340px; border-radius: 16px;
        transform: translateY(-8px); opacity: 0;
        transition: transform 0.32s cubic-bezier(.2,.7,.2,1), opacity 0.24s ease;
        box-shadow: 0 16px 40px rgba(28,20,8,0.2);
    }
    .mh-sheet.is-open { transform: none; opacity: 1; }
    .mh-sheet-grab { display: none; }
    .mh-scrim { background: transparent; }
}

/* A sub-category's label: its name, count and a small Share (owner, 2026-10-07). */
.menu-subcat-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.35rem; }
.menu-subcat-head .share-popover { bottom: auto; top: calc(100% + 0.4rem); left: auto; right: 0; }
.menu-subcat-count { margin-inline-start: 0.5rem; font-size: 0.75rem; font-weight: 500; color: var(--muted); }
.menu-sub-share { width: 34px; height: 34px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); }
.menu-subcat-title.is-arrived { animation: mh-arrive 0.9s cubic-bezier(.2,.7,.2,1); }
@keyframes mh-arrive { 0%, 25% { color: var(--amber); transform: translateX(4px); } 100% { transform: none; } }
.menu-subcat-block.is-arrived .menu-card { animation: mh-rise 0.42s cubic-bezier(.2,.7,.2,1) both; }
.menu-subcat-block.is-arrived .menu-card:nth-child(2) { animation-delay: 40ms; }
.menu-subcat-block.is-arrived .menu-card:nth-child(3) { animation-delay: 80ms; }
.menu-subcat-block.is-arrived .menu-card:nth-child(4) { animation-delay: 120ms; }
.menu-subcat-block.is-arrived .menu-card:nth-child(n+5) { animation-delay: 160ms; }
@keyframes mh-rise { from { opacity: 0.6; transform: translateY(8px); } to { opacity: 1; transform: none; } }
/* Sections and sub-categories: room between them, nothing more. */
.menu-sec { padding-top: 0.25rem; }
.menu-sec + .menu-sec { margin-top: 1.1rem; padding-top: 0.9rem; border-top: 6px solid color-mix(in srgb, var(--border) 45%, transparent); }

@media (max-width: 768px) {
    .mh-banner { height: 60px; border-radius: 12px; }
    .mh-copy { padding: 0 5.6rem 0 0.9rem; gap: 0.45rem; }
    .mh-title { height: 1.6rem; }
    .mh-title span { font-size: 1.15rem; line-height: 1.6rem; }
    .mh-count { font-size: 0.72rem; }
    .mh-share-btn, .mh-search { width: 34px; height: 34px; }
    .mh { --mh-bar-h: 52px; }
    .mh-bar { gap: 0.4rem; }
    .mh-chip { height: 36px; padding: 0 0.75rem; font-size: 0.8125rem; }
    .mh-pill { height: 36px; margin-top: -18px; }
    .mh-all { height: 36px; padding: 0 0.6rem; }
}
@media (prefers-reduced-motion: reduce) {
    .mh, .menu-rail, .mobile-header { transition: none !important; }
    .menu-rail-list > a, .menu-rail-pill { animation: none !important; }
    .mh *, .mh-sheet, .mh-sheet *, .mh-scrim, .menu-rail-pill, .menu-rail-list > a,
    .menu-rail-list > a .menu-rail-thumb { transition: none !important; animation: none !important; }
    .menu-subcat-title.is-arrived, .menu-subcat-block.is-arrived .menu-card { animation: none !important; }
}
/* An item whose photo has not arrived (or never will) shows the no-photo
   tile behind it, never its name in giant letters (owner's screenshot,
   2026-10-07). The alt text stays for screen readers. */
.menu-shell .menu-card-circle-photo { background-image: var(--menu-fallback, none); background-size: cover; background-position: center; }
.menu-shell .menu-card-circle-photo img { font-size: 0; color: transparent; }
.menu-shell .menu-card-circle-photo--cutout { background-image: none; }

/* ── Filter bar ─────────────────────────────────────────────────────── */
/* Hidden until JS is confirmed — see html.js in the layout. A search box
   that cannot search is worse than none. */
.menu-filters { display: none; }
/* Nothing in the filter bar is pinned, on any screen (owner, 2026-09-03:
   "mobile is ok but desktop still fixes the search box"). Search, Grid/List,
   sort and filter chips are set once and then scroll away with the page;
   only the header and the category rail stay put. */
html.js .menu-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0;
    background: var(--bg);
}
/* Toolbar row: search button + Grid/List, as in the order app. */
.menu-tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
}
.menu-tools--options { flex-wrap: wrap; }
.menu-tools--options .menu-view-toggle { margin-inline-start: 0; }
.menu-filter-rows {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    width: 100%;
}
.menu-tool {
    display: inline-flex; align-items: center; gap: 0.35rem;
    min-height: 44px;
    padding: 0 0.85rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--dark);
    font: inherit; font-size: 0.8rem; font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    /* The print entry point is a link, not a button. */
    text-decoration: none;
}
.menu-tool:hover { border-color: var(--amber); color: var(--amber); }
.menu-tool.is-on { background: var(--amber-light); border-color: var(--amber); color: var(--amber); }

.menu-view-toggle {
    margin-inline-start: auto;
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 999px;
    overflow: hidden;
}
.menu-view-btn {
    min-height: 44px;
    padding: 0 0.8rem;
    border: none;
    background: transparent;
    color: var(--muted);
    font: inherit; font-size: 0.78rem; font-weight: 700;
    cursor: pointer;
}
.menu-view-btn.is-active { background: var(--amber); color: #fff; }

/* Rail side (owner, 2026-09-03: "a button near grid/list to change from
   right to left"). The rail sits under the left thumb by default; a
   right-handed customer can move it to the other edge. Remembered per
   device under the same key the order app uses, applied on <html> before
   the shell paints so the page never jumps. */
.menu-rail-side {
    width: 44px; min-height: 44px; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 1.1rem; line-height: 1;
}
.menu-rail-side .menu-rail-side__icon { display: inline-block; }
html.rail-right .menu-shell { flex-direction: row-reverse; }
html.rail-right .menu-rail { border-right: 0; border-left: 1px solid var(--border); }
html.rail-right .menu-rail-side .menu-rail-side__icon { transform: scaleX(-1); }

/* In the tools row: takes the room between Search and Grid/List on a desk,
   and the whole row on a phone (see the mobile block). */
.menu-search {
    position: relative;
    flex: 1 1 200px;
    min-width: 0;
    display: flex;
    align-items: center;
}
.menu-search[hidden] { display: none; }
.menu-search-close {
    position: absolute;
    inset-inline-end: 0.35rem;
    min-width: 32px; min-height: 32px;
    border: none; background: none;
    color: var(--muted);
    font: inherit; cursor: pointer;
}
.menu-search-icon {
    position: absolute;
    inset-inline-start: 0.6rem;
    font-size: 0.8rem;
    pointer-events: none;
    opacity: 0.6;
}
.menu-search input {
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 2.4rem 0.5rem 2rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--dark);
    font: inherit;
    /* 16px: a phone zooms the whole page into any smaller field it focuses. */
    font-size: 16px;
}
.menu-search input:focus-visible {
    outline: 2px solid var(--amber);
    outline-offset: 1px;
}
.menu-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.menu-chip {
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
}
.menu-chip:hover { border-color: var(--amber); color: var(--amber); }
.menu-chip[aria-pressed="true"] {
    background: var(--amber);
    border-color: var(--amber);
    color: #fff;
}
.menu-no-match {
    padding: 2.5rem 0;
    text-align: center;
    color: var(--muted);
}
.menu-clear {
    border: none;
    background: none;
    padding: 0;
    color: var(--amber);
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
}
/* Filtered out. A hidden card must not stay tabbable — `hidden` alone is
   overridden by the `display:flex` on .menu-card. */
.menu-card[hidden], .menu-cat-section[hidden], .menu-subcat-block[hidden] { display: none; }

/* ── List view ──────────────────────────────────────────────────────── */
/* Same circle size as the grid — only the text moves beside it, which is
   what the order app does (.menu-card-article--list). */
.menu-main.is-list .menu-grid { grid-template-columns: 1fr; gap: 0.25rem; }
.menu-main.is-list .menu-card {
    flex-direction: row;
    align-items: center;
    gap: 0.9rem;
    text-align: start;
    padding: 0.5rem 0.25rem;
}
.menu-main.is-list .menu-card-circle { margin-bottom: 0; }
.menu-main.is-list .menu-card-body { align-items: flex-start; }
.menu-main.is-list .menu-card-desc { -webkit-line-clamp: 2; }
.menu-main.is-list .menu-card-price { margin-top: 0.2rem; }
.menu-main.is-list .menu-fav { top: 50%; transform: translateY(-50%); right: 0; }

/* ── Cards: round photo, three centred lines ────────────────────────── */
.menu-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.75rem;
    align-items: stretch;
}
.menu-card {
    position: relative;
    display: flex; flex-direction: column; align-items: center;
    height: 100%;
    padding: 0.55rem 0.35rem 0.85rem;
    text-align: center;
    color: inherit;
    border-radius: 12px;
}
.menu-card-link {
    color: inherit;
    text-decoration: none;
}
/* Stretched link: the article is the positioned box; the <a> covers it.
   A heart inside that <a> would be invalid HTML, so the heart is a sibling
   with a higher z-index and the tap on the rest of the card still opens
   the item. */
.menu-card-link::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
}
.menu-card:hover .menu-card-circle { transform: translateY(-2px); }
.menu-card-link:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.menu-fav {
    display: none;
    position: absolute;
    top: -0.15rem;
    right: max(0px, calc(50% - (var(--menu-circle) / 2) - 0.35rem));
    z-index: 1;
    min-width: 44px; min-height: 44px; width: 44px; height: 44px;
    padding: 0; border: none; border-radius: 999px;
    background: transparent;
    box-shadow: none;
    cursor: pointer;
    align-items: center; justify-content: center;
    font-size: 0.9rem; line-height: 1;
    text-decoration: none;
}
html.js .menu-fav { display: inline-flex; }
.menu-fav::before {
    content: '';
    position: absolute;
    width: 30px; height: 30px;
    border-radius: 999px;
    background: color-mix(in srgb, #FFFDF9 88%, transparent);
    box-shadow: 0 1px 5px rgba(28, 20, 8, 0.1);
    z-index: -1;
    pointer-events: none;
}

.menu-card-circle {
    position: relative;
    width: var(--menu-circle);
    aspect-ratio: 1 / 1;
    margin-bottom: 0.55rem;
    flex-shrink: 0;
    transition: transform 0.15s ease;
}
.menu-card-circle-photo {
    width: 100%; height: 100%;
    border-radius: 50%;
    overflow: hidden;
    background: var(--amber-light);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.9rem;
}
/* <picture> is an inline wrapper with no size of its own. Without this the
   img's width/height:100% resolve against a shrink-to-fit box instead of the
   circle, object-fit has no box to cover, and a landscape photo renders
   letterboxed with the circle's background showing above and below it. */
.menu-card-circle-photo picture { display: block; width: 100%; height: 100%; }
.menu-card-circle-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* Cut-out thumbnail (owner, 2026-10-01, after the ZUS app): the dish, with
   its background removed, floats over a circle the card draws. The circle is
   drawn a little smaller than the box so the dish can overhang it, and its
   colour and strength come from the item, its category, or the menu default
   (--cutout-color / --cutout-alpha on the element). */
.menu-card-circle-photo--cutout {
    background: transparent;
    overflow: visible;
    position: relative;
}
.menu-card-circle-photo--cutout::before {
    content: '';
    position: absolute;
    inset: 7%;
    border-radius: 50%;
    background: var(--cutout-color, #F3EAE1);
    opacity: var(--cutout-alpha, 1);
    z-index: 0;
}
.menu-card-circle-photo--cutout picture { position: relative; z-index: 1; }
.menu-card-circle-photo--cutout img {
    object-fit: contain;
    border-radius: 0;
    filter: drop-shadow(0 6px 10px rgba(28, 20, 8, 0.18));
}
.menu-card--sold-out .menu-card-circle-photo--cutout img { filter: none; }

.menu-card-body {
    display: flex; flex-direction: column; align-items: center;
    gap: 0.15rem;
    width: 100%; flex: 1; min-width: 0;
}
.menu-card-name {
    margin: 0;
    font-size: 1rem; font-weight: 600; line-height: 1.25;
    color: var(--dark);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; max-width: 100%;
}
.menu-card-desc {
    margin: 0;
    font-size: 0.8125rem; line-height: 1.3;
    color: var(--muted);
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
    overflow: hidden; max-width: 100%;
}
.menu-card-price {
    margin-top: auto; padding-top: 0.3rem;
    font-size: 0.9375rem; font-weight: 700;
    color: var(--dark);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.menu-card-from { font-size: 0.75rem; }
.menu-card-price-was {
    display: inline; margin-left: 0.35rem;
    font-weight: 400; text-decoration: line-through;
    color: var(--muted); opacity: 0.75;
}
.menu-card-image-badges {
    position: absolute;
    top: 0.25rem;
    left: 50%;
    transform: translateX(calc(-50% - 2.2rem));
    z-index: 2;
    pointer-events: none;
}
.menu-card-image-badges--circle { width: max-content; max-width: 46%; }
.menu-badge-new {
    display: inline-block;
    background: var(--amber);
    color: #fff; border: none;
    font-size: 0.68rem; font-weight: 800;
    letter-spacing: 0.03em; text-transform: uppercase;
    padding: 0.24rem 0.5rem; line-height: 1.2;
    border-radius: 999px;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--amber) 35%, transparent);
}
/* Sold out: the card fades but stays a link, as in the order app. The badge
   sits where New would, and takes its place — a sold-out dish is not news. */
.menu-badge-soldout {
    display: inline-block;
    background: var(--dark);
    /* The page colour, so the pill reads in both themes (--dark is cream at night). */
    color: var(--bg); border: none;
    font-size: 0.68rem; font-weight: 800;
    letter-spacing: 0.03em; text-transform: uppercase;
    padding: 0.24rem 0.5rem; line-height: 1.2;
    border-radius: 999px;
    box-shadow: 0 2px 8px rgba(28, 20, 8, 0.3);
    white-space: nowrap;
}
.menu-card--sold-out .menu-card-circle-photo { opacity: 0.45; filter: grayscale(0.7); }
/* The pill sits in the middle of the greyed photo, as in the order app. */
.menu-card--sold-out .menu-card-image-badges { top: 50%; transform: translate(-50%, -50%); max-width: 90%; }
.menu-card--sold-out .menu-card-body { opacity: 0.55; }
.menu-card--sold-out:hover .menu-card-circle { transform: none; }
/* The event section's one extra: a way into the wizard, above its dishes. */
.menu-events-plan { margin: 0.25rem 0 0.9rem; }

/* Bundles say so on the card. A "Mixed Platter" that a customer picks the
   contents of read exactly like a dish until now (owner's audit, 2026-09-06,
   F7). Quiet on purpose — this is a fact about the item, not a promotion, so
   it must not compete with the New badge or the price. */
.menu-card-bundle {
    display: inline-block;
    margin: 0.1rem 0 0.15rem;
    font-size: 0.66rem; font-weight: 700;
    letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.08rem 0.42rem;
    line-height: 1.4;
}

/* A rule above each sub-category. The cards carry no borders, so without
   it two sub-categories read as one run of round photos with a stray word
   between them. Owner, 2026-09-02. The first block under the band skips
   the rule — the band already separates. Same style in the order app. */
.menu-subcat-block--titled {
    margin-top: 0.9rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
}
.menu-sec > h2 + .menu-subcat-block--titled {
    margin-top: 0.25rem;
    padding-top: 0;
    border-top: none;
}
.menu-subcat-title {
    margin: 0 0 0.5rem;
    font-size: 0.95rem; font-weight: 700; letter-spacing: 0.01em;
    color: var(--dark);
}
/* A short rust stroke under each section's name (owner, 2026-10-07). */
.menu-subcat-title { position: relative; padding-bottom: 0.35rem; }
.menu-subcat-title::after {
    content: ""; position: absolute; inset-inline-start: 0; bottom: 0;
    width: 28px; height: 3px; border-radius: 2px; background: var(--amber);
}
/* A dish without a photo: a quiet cream circle with the flame, faded, so a
   category of them does not read as a wall of logos (owner, 2026-10-07). */
.menu-card-quiet {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--amber) 14%, var(--surface));
}
/* The no-photo tile behind the circle is for a photo that fails to load. */
.menu-shell .menu-card-circle-photo:has(.menu-card-quiet) { background-image: none; }
[data-theme="dark"] .menu-card-circle-photo .menu-card-quiet img { opacity: 0.5; }
.menu-card-circle-photo .menu-card-quiet img { width: 40%; height: auto; object-fit: contain; opacity: 0.32; }

.menu-offers { margin: 1.25rem 0 0.5rem; }
.menu-offers-title {
    margin: 0 0 0.75rem;
    font-size: 1.05rem; font-weight: 700;
}
.menu-offer-card {
    display: flex; flex-direction: column; align-items: center;
    padding: 0.55rem 0.35rem 0.85rem;
    text-align: center; text-decoration: none; color: inherit;
    border-radius: 12px;
}
.menu-offer-badge {
    display: inline-block; margin-bottom: 0.35rem;
    font-size: 0.68rem; font-weight: 800;
    letter-spacing: 0.03em; text-transform: uppercase;
    color: #fff; background: var(--amber);
    padding: 0.2rem 0.45rem; border-radius: 999px;
}

.menu-cta { padding: 1.5rem 0 1rem; text-align: center; }
.menu-complain { margin: 0 0 1rem; text-align: center; font-size: 0.8125rem; color: var(--muted); }
.menu-complain a { color: var(--amber); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
.menu-empty { max-width: 34rem; margin: 4rem auto; text-align: center; color: var(--muted); padding: 0 1.25rem; }

/* Dhivehi names and descriptions get the Thaana face and RTL flow even on an
   otherwise English page — an item name is content, not chrome. */
[lang="dv"] { font-family: var(--font-dhivehi); direction: rtl; }

@media (max-width: 768px) {
    /* The mobile header is the only sticky chrome — the order status bar
       under it scrolls away — so the rail clears ~64px, not the layout's
       more generous scroll-padding-top. */
    :root { --menu-rail-w: 70px; --menu-sticky: 64px; }
    /* The site header slides away while scrolling down the menu and comes
       back on the way up (owner, 2026-10-07), as the order app's brand row
       scrolls away. The banner and rail follow it up to the top. */
    .mobile-header { transition: transform 0.3s cubic-bezier(.2,.7,.2,1); }
    html.menu-header-away .mobile-header { transform: translateY(-100%); }
    html.menu-header-away { --menu-sticky: 0px; }
    .mh, .menu-rail { transition: top 0.3s cubic-bezier(.2,.7,.2,1); }
    .menu-shell { gap: 0.5rem; padding: 0 0.75rem 5rem; }
    /* minmax(0, 1fr), not 1fr: a bare 1fr will not shrink below a card's
       own minimum, and two 143px cards plus the gap ran 4px past a 390px
       phone, so the whole page wobbled sideways under a thumb. */
    .menu-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .menu-rail-label { font-size: 0.6875rem; }
    /* The 76px rail: a narrower list inset so two-word labels still fit. */
    .menu-rail-list { padding: 0 3px; }
    .menu-rail-list > a { border-radius: 12px; }

}

/* ── Item sheet ─────────────────────────────────────────────────────────
   Slides up over the menu instead of navigating. Desktop gets a centred
   panel: a bottom sheet on a wide screen is a phone idiom stranded. */
.menu-sheet-backdrop {
    position: fixed; inset: 0; z-index: 900;
    background: rgba(28,20,8,0.45);
    animation: menu-sheet-fade 0.16s ease;
}
@keyframes menu-sheet-fade { from { opacity: 0; } to { opacity: 1; } }

.menu-sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 901;
    max-height: min(92dvh, 92vh);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--surface);
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -10px 40px rgba(28,20,8,0.22);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    transform: translateY(100%);
    transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1);
}
.menu-sheet.is-open { transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
    .menu-sheet { transition: none; }
    .menu-sheet-backdrop { animation: none; }
}

/* Sticky so the way out stays reachable however far down the item runs. */
.menu-sheet-head {
    display: flex; align-items: center;
    padding: 10px 10px 2px;
    background: var(--surface);
}
.menu-sheet-grab {
    width: 40px; height: 4px; border-radius: 999px;
    background: var(--border, #e8e0d8);
    margin: 0 auto;
}
/* The close takes the slot "← Full menu" holds on the full page, so the row
   reads exactly as the order app's does: a way back on the left, Share on the
   right. Floating it in the corner instead put it on top of Share and the
   favourite heart — owner, 2026-09-01. */
.menu-sheet .menu-item-back { display: none; }
.menu-sheet-back {
    display: none;
    align-items: center; gap: 6px;
    min-height: 44px; padding: 0;
    background: none; border: none;
    font-family: inherit; font-size: 0.95rem; font-weight: 700;
    color: var(--amber); cursor: pointer;
}
.menu-sheet .menu-sheet-back { display: inline-flex; }
.menu-sheet-loading {
    margin: 0; padding: 3rem 1rem; text-align: center;
    color: var(--muted, #6b5d4f); font-weight: 600;
}
/* The head bar already spaces the top. */
.menu-sheet .menu-item-page { padding-top: 0.25rem; }
/* "Full menu" is the sheet's own close button here. */
.menu-sheet .menu-item-back { display: none; }

body.menu-sheet-open { overflow: hidden; }

@media (min-width: 768px) {
    .menu-sheet {
        left: 50%; right: auto; bottom: auto; top: 50%;
        width: min(520px, calc(100vw - 48px));
        max-height: min(86vh, 760px);
        border-radius: 18px;
        transform: translate(-50%, -46%) scale(0.98);
        opacity: 0;
        transition: transform 0.18s ease, opacity 0.18s ease;
    }
    .menu-sheet.is-open { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    .menu-sheet-grab { display: none; }
    .menu-sheet-head { border-radius: 18px 18px 0 0; }
}
</style>
@include('partials.menu-item-styles')
@endsection

@section('content')
@php
    /** Dhivehi where we have it, English otherwise — never an empty card. */
    $itemName = function ($item) use ($menuLocale) {
        if ($menuLocale === 'dv') {
            $dv = trim((string) ($item->card_name_dv ?: $item->name_dv ?: ''));
            if ($dv !== '') return ['text' => $dv, 'dv' => true];
        }
        return ['text' => (string) ($item->card_name ?: $item->name), 'dv' => false];
    };

    $itemDesc = function ($item) use ($menuLocale) {
        if ($menuLocale === 'dv') {
            $dv = trim((string) ($item->short_description_dv ?: ''));
            if ($dv !== '') return ['text' => $dv, 'dv' => true];
        }
        $en = trim((string) ($item->short_description ?: $item->description ?: ''));
        return ['text' => $en, 'dv' => false];
    };

    $categoryName = function ($category) use ($menuLocale) {
        if (! $category) return ['text' => 'Other', 'dv' => false];
        if ($menuLocale === 'dv') {
            $dv = trim((string) ($category->name_dv ?: ''));
            if ($dv !== '') return ['text' => $dv, 'dv' => true];
        }
        return ['text' => (string) $category->name, 'dv' => false];
    };

    /**
     * Same rule as Item::display_image_url, applied to thumbnails and category
     * art too: a locally-hosted cafe image is rebuilt against this site's
     * origin, so a database copied from TEST still renders on production.
     * Anything else is a genuine external URL and is left alone.
     */
    $mediaUrl = function ($raw) {
        $raw = trim((string) $raw);
        if ($raw === '') return null;
        if (! str_starts_with($raw, 'http')) return url(ltrim($raw, '/'));
        $path = trim(preg_replace('#^https?://[^/]+#', '', $raw), '/');
        return str_starts_with($path, 'images/cafe/') ? url($path) : $raw;
    };

    /*
     * A category without a photo still gets a distinct banner, from the brand's
     * own rust and browns (owner, 2026-10-07: purple, blue and green ones were
     * picked from the category number and are not brand colours). The same
     * six pairs as the order app's menuTint(). Its rail tile is cream with a
     * rust letter, like every other tile without a photo.
     */
    $tint = function ($id) {
        $pairs = [['#9A3F0A', '#4A220C'], ['#B74B0C', '#5E2A0E'], ['#8A4B1F', '#3E2412'],
            ['#A85A1E', '#4F2810'], ['#7C3A12', '#33190A'], ['#B0602A', '#5A2E12']];
        [$a, $b] = $pairs[abs((int) $id) % count($pairs)];

        return "linear-gradient(135deg, {$a} 0%, {$b} 100%)";
    };
    $tintSoft = fn ($id) => 'var(--amber-light)';

    $defaultItemImage = $mediaUrl(content('default_item_image'));
    $menuOffers = $menuOffers ?? collect();
    $menuFeatured = $menuFeatured ?? collect();
    $menuFeaturedTitle = $menuFeaturedTitle ?? "Chef's picks";
    $menuComplaintLine = trim((string) ($menuComplaintLine ?? content('complaint_prompt_text', '')));
    $menuNewItemIds = $menuNewItemIds ?? [];
    $menuSoldOut = $menuSoldOut ?? [];
    $menuCatering = $menuCatering ?? collect();
    $menuCategoryUrls = $menuCategoryUrls ?? [];
    $menuSectionBanners = $menuSectionBanners ?? [];
    $menuStart = $menuStart ?? null;
    // $key is a category id, or 'other' / 'events' for the two sections that
    // are not categories but get the same banner, share and page.
    $shareFor = function ($key, $text) use ($menuCategoryUrls) {
        return [
            'shareUrl' => $menuCategoryUrls[$key] ?? url('/menu/c/' . $key),
            'shareTitle' => $text . ' – Bake & Grill menu',
            'shareText' => 'See our ' . $text . ' menu at Bake & Grill',
            'shareId' => 'share-cat-' . $key,
            'shareLabel' => 'Share ' . $text,
            'shareCategoryId' => is_numeric($key) ? (int) $key : null,
        ];
    };
    $menuBundles = $menuBundles ?? [];
    $menuSpecialsByItemId = $menuSpecialsByItemId ?? [];
    $menuPriceByItemId = $menuPriceByItemId ?? [];
    $menuPhotos = $menuPhotos ?? [];
    $favouriteIds = $favouriteIds ?? [];

    $anchorFor = fn ($group) => $group['category'] ? 'cat-' . $group['category']->id : 'cat-other';

    $sectionCount = function ($group) {
        $n = count($group['items']);
        foreach ($group['subcategories'] ?? [] as $sub) {
            $n += count($sub['items']);
        }

        return $n;
    };

    // What the customer is actually charged, resolved in the controller via
    // EffectivePriceService — the same resolver the order pipeline uses. It
    // covers daily specials AND item-level auto-promotions; reading the
    // specials rows alone (as this did) advertised an auto-promoted item at
    // full price here while the app and the till both charged less.
    $priceFor = function ($item) use ($menuPriceByItemId) {
        $row = $menuPriceByItemId[$item->id] ?? null;
        if (is_array($row)) {
            return $row;
        }

        // Only reached if an item rendered without passing through the
        // controller's map. Show the catalog price rather than nothing.
        $info = $item->displayPriceInfo();
        $info['was'] = null;

        return $info;
    };
@endphp

{{-- The hero band that stood here — eyebrow, "Everything we make", and a
     tagline — was removed on the owner's call. It pushed the food most of a
     screen down on a phone, which is the whole thing this page exists to
     avoid: someone scanning the QR code at a table wants the menu, not a
     welcome.

     The <h1> stays, visually hidden. It is the page's only level-one
     heading, so removing it outright would leave the outline starting at h2
     and give search results nothing to title the page with. --}}
<h1 class="visually-hidden">Bake &amp; Grill menu</h1>

@if($menuCategories->isEmpty() && $menuOffers->isEmpty() && $menuCatering->isEmpty())
    <div class="menu-empty">
        <p>The menu is being updated. Please check back shortly, or call us to order.</p>
        <p style="margin-top:1rem"><a href="/contact" class="btn-primary">Contact us →</a></p>
    </div>
@else
{{-- Rail side, before the shell paints so a remembered "right" never jumps. --}}
<script nonce="{{ csp_nonce() }}">
try { if (localStorage.getItem('bg-menu-rail-side') === 'right') document.documentElement.classList.add('rail-right'); } catch (e) {}
</script>
@php
    /*
     * The menu's top-level sections, in page order (owner, 2026-10-07: "keep
     * the main category in the rail and sub category below the banner").
     * Each one is an entry in the rail, a look for the pinned banner (name,
     * photo or tint, count, Share) and, when it has sub-categories, a row of
     * buttons under the banner. One list drives all three so they cannot
     * disagree.
     */
    $secs = [];
    if ($menuFeatured->isNotEmpty()) {
        $secs[] = ['id' => 'menu-view-featured', 'name' => $menuFeaturedTitle, 'dv' => false, 'image' => null,
            'tint' => 'linear-gradient(135deg, hsl(38 72% 48%) 0%, hsl(24 70% 34%) 100%)', 'count' => $menuFeatured->count(),
            'share' => null, 'subs' => [], 'rail' => 'featured'];
    }
    if ($menuOffers->isNotEmpty()) {
        $secs[] = ['id' => 'menu-view-offers', 'name' => 'Offers', 'dv' => false, 'image' => null,
            'tint' => 'linear-gradient(135deg, hsl(14 70% 46%) 0%, hsl(0 62% 32%) 100%)', 'count' => $menuOffers->count(),
            'share' => null, 'subs' => [], 'rail' => 'offers'];
    }
    foreach ($menuCategories as $group) {
        $gCat = $group['category'];
        $gName = $categoryName($gCat);
        $gKey = $gCat ? $gCat->id : 'other';
        $subs = [];
        $hasSubs = ! empty($group['subcategories']);
        if ($group['items']->isNotEmpty() && $hasSubs) {
            // Dishes filed on the parent itself come first, under its own name.
            $subs[] = ['id' => $anchorFor($group) . '-items', 'name' => $gName['text'], 'dv' => $gName['dv'], 'count' => $group['items']->count()];
        }
        foreach ($group['subcategories'] ?? [] as $sub) {
            $sn = $categoryName($sub['category']);
            $subs[] = ['id' => 'cat-' . $sub['category']->id, 'name' => $sn['text'], 'dv' => $sn['dv'], 'count' => count($sub['items'])];
        }
        $secs[] = ['id' => $anchorFor($group), 'name' => $gName['text'], 'dv' => $gName['dv'],
            'image' => $mediaUrl($gCat ? $gCat->image_url : ($menuSectionBanners['other'] ?? null)),
            'thumb' => $mediaUrl($gCat ? ($gCat->thumb_url ?: $gCat->image_url) : ($menuSectionBanners['other'] ?? null)),
            'tint' => $tint($gCat?->id ?? 0), 'tintSoft' => $tintSoft($gCat?->id ?? 0), 'count' => $sectionCount($group),
            'share' => $shareFor($gKey, $gName['text']), 'subs' => count($subs) > 1 ? $subs : [], 'rail' => 'category', 'group' => $group];
    }
    if ($menuCatering->isNotEmpty()) {
        $secs[] = ['id' => 'cat-events', 'name' => 'Event & catering', 'dv' => false,
            'image' => $mediaUrl($menuSectionBanners['events'] ?? null), 'tint' => $tint(2), 'count' => $menuCatering->count(),
            'share' => $shareFor('events', 'Event & catering'), 'subs' => [], 'rail' => 'events'];
    }
    $firstSec = $secs[0] ?? null;
    $shareIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';
@endphp
<div class="menu-shell" @if($menuStart) data-menu-start="{{ $menuStart }}" @endif
     @if($defaultItemImage) style="--menu-fallback: url('{{ $defaultItemImage }}')" @endif>
    {{-- The rail: main categories only. The highlight glides between them as
         the page scrolls (owner, 2026-10-07). Plain anchor links, so it works
         before any script runs. --}}
    <nav class="menu-rail" aria-label="Menu categories">
        <div class="menu-rail-scroll">
        <div class="menu-rail-list">
            <span class="menu-rail-pill" aria-hidden="true"></span>
            @foreach($secs as $sec)
                @if($sec['rail'] === 'featured')
                    <a href="#menu-view-featured" data-testid="menu-featured-pill" data-sec="menu-view-featured"
                       aria-label="{{ $sec['name'] }}, {{ $sec['count'] }} {{ Str::plural('item', $sec['count']) }}">
                        <span class="menu-rail-thumb" aria-hidden="true">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
                                <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/>
                            </svg>
                        </span>
                        <span class="menu-rail-label">{{ $sec['name'] }}</span>
                    </a>
                @elseif($sec['rail'] === 'offers')
                    <a href="#menu-view-offers" data-testid="menu-offers-pill" data-sec="menu-view-offers" aria-label="Offers">
                        <span class="menu-rail-thumb" aria-hidden="true">%</span>
                        <span class="menu-rail-label">Offers</span>
                    </a>
                @elseif($sec['rail'] === 'category')
                    {{-- The count is a bare numeral beside a name; spoken aloud it
                         reads "Shorteats 3", so the link carries it as words instead. --}}
                    <a href="#{{ $sec['id'] }}" data-sec="{{ $sec['id'] }}"
                       aria-label="{{ $sec['name'] }}, {{ $sec['count'] }} {{ Str::plural('item', $sec['count']) }}">
                        @if($sec['thumb'])
                            <img class="menu-rail-thumb" src="{{ $sec['thumb'] }}" alt="" loading="lazy" width="64" height="64">
                        @else
                            <span class="menu-rail-thumb" aria-hidden="true" style="background: {{ $sec['tintSoft'] }}">
                                {{ mb_strtoupper(mb_substr($sec['name'], 0, 1)) }}
                            </span>
                        @endif
                        <span class="menu-rail-label" @if($sec['dv']) lang="dv" @endif>{{ $sec['name'] }}</span>
                        <span class="menu-rail-count" aria-hidden="true">{{ $sec['count'] }}</span>
                    </a>
                @endif
            @endforeach
            {{-- Same last-on-rail shortcut as the order app CategoryRail: the
                 on-page Event & catering section when there is one, else the
                 wizard at /order/events. --}}
            <a href="{{ $menuCatering->isNotEmpty() ? '#cat-events' : '/order/events' }}"
               class="menu-rail-events" data-testid="cat-rail-events"
               @if($menuCatering->isNotEmpty()) data-sec="cat-events" @endif
               aria-label="{{ $menuCatering->isNotEmpty() ? 'Events, ' . $menuCatering->count() . ' ' . Str::plural('item', $menuCatering->count()) : 'Events' }}">
                <span class="menu-rail-thumb" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M5.8 11.3 2 22l10.7-3.79"/>
                        <path d="M4 3h.01"/>
                        <path d="M22 8h.01"/>
                        <path d="M15 2h.01"/>
                        <path d="M22 20h.01"/>
                        <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/>
                        <path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/>
                        <path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/>
                        <path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>
                    </svg>
                </span>
                <span class="menu-rail-label">Events</span>
            </a>
        </div>
        </div>
    </nav>

    <div class="menu-main">
        {{-- One banner for the whole menu, pinned under the site header (owner,
             2026-10-07). It changes in place as the page scrolls: the photo
             cross-fades, the name rolls, the buttons slide across. Drawn here
             for the first section so it reads right before any script runs. --}}
        @if($firstSec)
        <div class="mh{{ $firstSec['subs'] !== [] ? ' has-row mh--room' : '' }}" data-mh data-testid="menu-head">
            <div class="mh-banner" @if(! $firstSec['image']) style="background: {{ $firstSec['tint'] }}" @endif>
                <div class="mh-img is-on" @if($firstSec['image']) style="background-image: url('{{ $firstSec['image'] }}')" @endif></div>
                <div class="mh-img"></div>
                <div class="mh-shade" aria-hidden="true"></div>
                <div class="mh-copy" aria-live="polite">
                    <div class="mh-title"><span @if($firstSec['dv']) lang="dv" @endif>{{ $firstSec['name'] }}</span></div>
                    <span class="mh-count">{{ $firstSec['count'] }} {{ Str::plural('item', $firstSec['count']) }}</span>
                </div>
                {{-- Search (the panel opens under the buttons) and Share for
                     whichever category is in view: one Share per section, the
                     current one shown. --}}
                <div class="mh-actions">
                    <button type="button" class="mh-search" id="menuSearchToggle"
                            aria-expanded="false" aria-controls="menuSearchPanel" aria-label="Search, sort and filter">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    </button>
                    <div class="mh-shares">
                    @foreach($secs as $si => $sec)
                        @if($sec['share'])
                            <div class="mh-share" data-sec="{{ $sec['id'] }}" @if($si > 0) hidden @endif>
                                @include('partials.share-control', $sec['share'] + ['shareButtonClass' => 'mh-share-btn', 'shareIconHtml' => $shareIcon])
                            </div>
                        @endif
                    @endforeach
                </div>
                </div>
            </div>
            {{-- The buttons and the search panel hang under the banner and float
                 over the dishes, so a section without sub-categories shows no
                 empty strip and nothing jumps as the row comes and goes. --}}
            <div class="mh-under">
            <div class="mh-bar">
                <div class="mh-rows">
                    @foreach($secs as $si => $sec)
                        @if($sec['subs'] !== [])
                            <nav class="mh-chips{{ $si === 0 ? ' is-on' : '' }}" data-sec="{{ $sec['id'] }}" aria-label="Sections of {{ $sec['name'] }}">
                                <span class="mh-pill" aria-hidden="true"></span>
                                @foreach($sec['subs'] as $sub)
                                    <a class="mh-chip" href="#{{ $sub['id'] }}" data-target="{{ $sub['id'] }}" @if($sub['dv']) lang="dv" @endif>{{ $sub['name'] }}<em>{{ $sub['count'] }}</em></a>
                                @endforeach
                            </nav>
                        @endif
                    @endforeach
                </div>
                <button type="button" class="mh-all" hidden aria-haspopup="dialog" data-testid="menu-all">
                    All <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                </button>
            </div>
            {{-- Search, layout, sort and filters, behind the search icon so they
                 no longer push the food down (owner, 2026-10-07). Filtering
                 needs JavaScript — every card is in the HTML and this hides the
                 ones that do not match — so without it the panel never opens. --}}
            <div class="mh-panel" id="menuSearchPanel" hidden>
                <div class="menu-filters" data-testid="menu-filters">
                    <div class="menu-tools">
                        <div class="menu-search" id="menuSearchWrap">
                            <label class="visually-hidden" for="menuSearch">Search the menu</label>
                            <span class="menu-search-icon" aria-hidden="true">🔍</span>
                            <input type="search" id="menuSearch" placeholder="Search the menu"
                                   autocomplete="off" enterkeyhint="search">
                            <button type="button" class="menu-search-close" aria-label="Close search">✕</button>
                        </div>
                    </div>
                    <div class="menu-tools menu-tools--options">
                        <div class="menu-view-toggle" role="group" aria-label="Menu layout">
                            <button type="button" class="menu-view-btn is-active" data-view="grid" aria-pressed="true">Grid</button>
                            <button type="button" class="menu-view-btn" data-view="list" aria-pressed="false">List</button>
                        </div>
                        <button type="button" class="menu-tool menu-rail-side" id="menuRailSide"
                                data-testid="menu-rail-side"
                                aria-pressed="false" aria-label="Move the categories to the right side"
                                title="Swap the category rail to the other side">
                            <span class="menu-rail-side__icon" aria-hidden="true">⇆</span>
                        </button>
                        {{-- The menu on paper (owner, 2026-09-05). A link rather than
                             window.print(): printing this page would put the rail
                             and the pinned banner on the paper. --}}
                        <a href="{{ route('menu.print') }}" class="menu-tool" data-testid="menu-print-link"
                           title="Print or save the menu">
                            <span aria-hidden="true">🖨</span> Print
                        </a>
                    </div>
                    <div class="menu-filter-rows">
                    {{-- Sort is one choice, so these are radio-ish: exactly one on at a
                         time. Filters below are independent and combine. --}}
                    <div class="menu-chips" role="group" aria-label="Sort the menu">
                        <button type="button" class="menu-chip menu-sort is-active" data-sort="name" aria-pressed="true">A–Z</button>
                        <button type="button" class="menu-chip menu-sort" data-sort="price-low" aria-pressed="false">Price ↑</button>
                        <button type="button" class="menu-chip menu-sort" data-sort="price-high" aria-pressed="false">Price ↓</button>
                    </div>

                    @php
                        $hasSpecial = collect($menuSpecialsByItemId)->isNotEmpty();
                        $hasNew = ! empty($menuNewItemIds);
                    @endphp
                    @if($hasSpecial || $hasNew || $menuDietaryFilters !== [])
                        {{-- Only chips that can actually match something. A filter that
                             always returns nothing is worse than no filter. --}}
                        <div class="menu-chips" role="group" aria-label="Filter the menu">
                            @if($hasSpecial)
                                <button type="button" class="menu-chip" data-filter="special" aria-pressed="false">% Offers</button>
                            @endif
                            @if($hasNew)
                                <button type="button" class="menu-chip" data-filter="new" aria-pressed="false">New</button>
                            @endif
                            @foreach($menuDietaryFilters as $chip)
                                <button type="button" class="menu-chip" data-filter="diet:{{ $chip['slug'] }}" aria-pressed="false">{{ $chip['label'] }}</button>
                            @endforeach
                            <button type="button" class="menu-chip menu-clear-chip" hidden>Clear</button>
                        </div>
                    @else
                        <div class="menu-chips">
                            <button type="button" class="menu-chip menu-clear-chip" hidden>Clear</button>
                        </div>
                    @endif
                    </div>{{-- /.menu-filter-rows --}}
                </div>
            </div>
            </div>{{-- /.mh-under --}}
        </div>
        @endif

        <p class="menu-no-match" data-testid="menu-no-match" hidden>
            Nothing on the menu matches that. <button type="button" class="menu-clear">Clear filters</button>
        </p>

        @foreach($secs as $sec)
            @php $secAttrs = 'data-mh-name="' . e($sec['name']) . '" data-mh-count="' . $sec['count'] . '" data-mh-tint="' . e($sec['tint']) . '"' . ($sec['image'] ? ' data-mh-img="' . e($sec['image']) . '"' : '') . ($sec['dv'] ? ' data-mh-dv="1"' : ''); @endphp
            @if($sec['rail'] === 'featured')
                {{-- The owner's hand-picked dishes, ahead of the categories (owner,
                     2026-09-21). Each is the same card it has in its own category,
                     so the two cannot drift; the filter script leaves this strip
                     out while filtering, as it does the offers. --}}
                <section class="menu-sec menu-offers menu-featured" id="menu-view-featured" data-testid="menu-view-featured" {!! $secAttrs !!}>
                    <h2 class="visually-hidden">{{ $sec['name'] }}</h2>
                    <div class="menu-grid">
                        @foreach($menuFeatured as $item)
                            @include('partials.menu-card', ['item' => $item, 'itemHeading' => 'h3'])
                        @endforeach
                    </div>
                </section>
            @elseif($sec['rail'] === 'offers')
                <section class="menu-sec menu-offers" id="menu-view-offers" data-testid="menu-view-offers" {!! $secAttrs !!}>
                    <h2 class="visually-hidden">Offers</h2>
                    <div class="menu-grid">
                        @foreach($menuOffers as $offer)
                            @php
                                $offerHref = \App\Support\PublicOfferUrl::fromFeedRow($offer);
                                // Prefer the gallery photo the item cards already
                                // resolved. OffersService fills image_url from
                                // display_image_url — the main image — so an offer
                                // would otherwise show the stale photo the cards
                                // were just fixed to stop showing.
                                $offerItemId = $offer['target']['item_id'] ?? null;
                                $offerPhoto = ($offerItemId ? ($menuPhotos[$offerItemId]['url'] ?? null) : null)
                                    ?: $mediaUrl($offer['image_url'] ?? null)
                                    ?: $defaultItemImage;
                            @endphp
                            <a class="menu-offer-card" href="{{ $offerHref }}">
                                <div class="menu-card-circle">
                                    <div class="menu-card-circle-photo">
                                        @if($offerPhoto)
                                            <img src="{{ $offerPhoto }}" alt="" loading="lazy" width="132" height="132">
                                        @else
                                            <span aria-hidden="true">🍽️</span>
                                        @endif
                                    </div>
                                </div>
                                @if(!empty($offer['badge']))
                                    <span class="menu-offer-badge">{{ $offer['badge'] }}</span>
                                @endif
                                <span class="menu-card-name">{{ $offer['title'] ?? '' }}</span>
                                @if(isset($offer['effective_price']) && $offer['effective_price'] !== null)
                                    <div class="menu-card-price">
                                        MVR {{ number_format((float) $offer['effective_price'], 2) }}
                                        @if(!empty($offer['original_price']) && (float) $offer['original_price'] > (float) $offer['effective_price'])
                                            <s class="menu-card-price-was">MVR {{ number_format((float) $offer['original_price'], 2) }}</s>
                                        @endif
                                    </div>
                                @endif
                            </a>
                        @endforeach
                    </div>
                </section>
            @elseif($sec['rail'] === 'category')
                @php
                    $group = $sec['group'];
                    $blocks = [];
                    if ($group['items']->isNotEmpty()) {
                        $blocks[] = ['heading' => null, 'items' => $group['items']];
                    }
                    foreach ($group['subcategories'] ?? [] as $sub) {
                        $blocks[] = ['heading' => $sub['category'], 'items' => $sub['items']];
                    }
                @endphp
                <section class="menu-sec menu-cat-section" id="{{ $sec['id'] }}" {!! $secAttrs !!}>
                    {{-- The pinned banner above shows the name; this heading keeps
                         the page outline and is what a screen reader lands on. --}}
                    <h2 class="visually-hidden" @if($sec['dv']) lang="dv" @endif>{{ $sec['name'] }}</h2>
                    @foreach($blocks as $block)
                        @php
                            $blockId = $block['heading'] ? 'cat-' . $block['heading']->id : ($sec['subs'] !== [] ? $sec['id'] . '-items' : null);
                            $labelName = $block['heading'] ? $categoryName($block['heading']) : ($sec['subs'] !== [] ? ['text' => $sec['name'], 'dv' => $sec['dv']] : null);
                        @endphp
                        {{-- Wrapped so filtering can hide a sub-category's label with
                             its items; a lone heading over an empty grid reads as a
                             rendering bug. --}}
                        <div class="menu-subcat-block{{ $labelName ? ' menu-subcat-block--titled' : '' }}"@if($blockId) id="{{ $blockId }}"@endif>
                        @if($labelName)
                            {{-- A thin label where each sub-category starts, with its
                                 count and its own Share (owner, 2026-10-07). --}}
                            <div class="menu-subcat-head">
                                <h3 class="menu-subcat-title" @if($labelName['dv']) lang="dv" @endif>{{ $labelName['text'] }}<span class="menu-subcat-count">{{ count($block['items']) }} {{ Str::plural('item', count($block['items'])) }}</span></h3>
                                @if($block['heading'])
                                    @include('partials.share-control', $shareFor($block['heading']->id, $labelName['text']) + ['shareButtonClass' => 'menu-sub-share', 'shareIconHtml' => $shareIcon])
                                @endif
                            </div>
                        @endif
                        <div class="menu-grid">
                            @foreach($block['items'] as $item)
                                @include('partials.menu-card', ['item' => $item, 'itemHeading' => $block['heading'] ? 'h4' : 'h3'])
                            @endforeach
                        </div>
                        </div>{{-- /.menu-subcat-block --}}
                    @endforeach
                </section>
            @elseif($sec['rail'] === 'events')
                {{-- Event & catering menu — the same block the order app ends with
                     (owner, 2026-09-21). The wizard is one tap away inside. --}}
                <section class="menu-sec menu-cat-section menu-cat-section--events" id="cat-events" data-testid="menu-events-section" {!! $secAttrs !!}>
                    <h2 class="visually-hidden">Event &amp; catering menu</h2>
                    <div class="menu-subcat-block">
                        <p class="menu-events-plan">
                            <a href="/order/events" class="btn-outline" data-testid="menu-events-plan">Plan an event →</a>
                        </p>
                        <div class="menu-grid">
                            @foreach($menuCatering as $item)
                                @include('partials.menu-card', ['item' => $item, 'itemHeading' => 'h3'])
                            @endforeach
                        </div>
                    </div>
                </section>
            @endif
        @endforeach
        <div class="menu-cta">
            <a href="/order/menu" class="btn-primary">Start your order →</a>
        </div>
        {{-- One quiet line, under the food, never on a card or in the rail
             (owner, 2026-09-21: complaint details "shortly" in the menu). --}}
        <p class="menu-complain" data-testid="menu-complain">
            {{ $menuComplaintLine }}
            <a href="/complain?from=menu">Make a complaint</a>
        </p>
    </div>
</div>

{{-- The All panel (owner, 2026-10-07): every sub-category of the section in
     view, with counts. A sheet from the bottom on a phone, a dropdown on a
     computer. Filled by the script from the button row. --}}
<div class="mh-scrim" data-mh-scrim hidden></div>
<div class="mh-sheet" data-mh-sheet role="dialog" aria-modal="true" aria-labelledby="mhSheetTitle" hidden>
    <div class="mh-sheet-grab" aria-hidden="true"></div>
    <div class="mh-sheet-head">
        <h2 id="mhSheetTitle" class="mh-sheet-title"></h2>
        <span class="mh-sheet-count"></span>
        <button type="button" class="mh-sheet-x" aria-label="Close">×</button>
    </div>
    <ul class="mh-sheet-list"></ul>
</div>


@php
    // Built as an array and emitted with @json rather than hand-written:
    // an item name with an apostrophe or a quote would otherwise produce
    // invalid JSON-LD, and Google reports that to nobody.
    $toMenuItem = function ($item) use ($itemName, $itemDesc, $priceFor, $menuPhotos, $menuSoldOut) {
        $price = $priceFor($item);
        $desc = $itemDesc($item)['text'];

        return array_filter([
            '@type' => 'MenuItem',
            'name' => $itemName($item)['text'],
            'description' => $desc !== '' ? $desc : null,
            // The full size, not the card's thumbnail: Google wants a
            // large image for rich results, and the card deliberately
            // asks for 400px because it draws a 132px circle.
            'image' => ($menuPhotos[$item->id]['full'] ?? null)
                ?: (($menuPhotos[$item->id]['url'] ?? null) ?: ($item->display_image_url ?: null)),
            'url' => url('/menu/' . $item->id),
            'offers' => array_filter([
                '@type' => 'Offer',
                'price' => number_format($price['price'], 2, '.', ''),
                'priceCurrency' => 'MVR',
                'availability' => isset($menuSoldOut[$item->id]) ? 'https://schema.org/SoldOut' : null,
            ], fn ($v) => $v !== null),
        ], fn ($v) => $v !== null);
    };

    $menuSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'Menu',
        'name' => 'Bake & Grill menu',
        'url' => url('/menu'),
        'inLanguage' => $menuLocale === 'dv' ? 'dv' : 'en',
        'hasMenuSection' => $menuCategories->map(function ($group) use ($categoryName, $toMenuItem) {
            $section = [
                '@type' => 'MenuSection',
                'name' => $categoryName($group['category'])['text'],
                'hasMenuItem' => $group['items']->map($toMenuItem)->values()->all(),
            ];
            $nested = [];
            foreach ($group['subcategories'] ?? [] as $sub) {
                $nested[] = [
                    '@type' => 'MenuSection',
                    'name' => $categoryName($sub['category'])['text'],
                    'hasMenuItem' => $sub['items']->map($toMenuItem)->values()->all(),
                ];
            }
            if ($nested !== []) {
                $section['hasMenuSection'] = $nested;
            }

            return $section;
        })->values()->concat($menuCatering->isNotEmpty() ? [[
            '@type' => 'MenuSection',
            'name' => 'Event & catering menu',
            'hasMenuItem' => $menuCatering->map($toMenuItem)->values()->all(),
        ]] : [])->all(),
    ];
@endphp
<script type="application/ld+json">@json($menuSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)</script>
@endif

{{-- Filtering. Every card is already in the HTML; this only hides the ones
     that do not match, so with JS off the whole menu is still readable — the
     bar itself stays hidden in that case. --}}
<script nonce="{{ csp_nonce() }}">
(function () {
    var bar = document.querySelector('.menu-filters');
    if (!bar) return;

    var input = document.getElementById('menuSearch');
    var searchWrap = document.getElementById('menuSearchWrap');
    var searchToggle = document.getElementById('menuSearchToggle');
    var searchClose = bar.querySelector('.menu-search-close');
    var chips = Array.prototype.slice.call(bar.querySelectorAll('.menu-chip:not(.menu-sort):not(.menu-clear-chip)'));
    var sorts = Array.prototype.slice.call(bar.querySelectorAll('.menu-sort'));
    var viewBtns = Array.prototype.slice.call(bar.querySelectorAll('.menu-view-btn'));
    var clearChip = bar.querySelector('.menu-clear-chip');
    var main = document.querySelector('.menu-main');
    var grids = Array.prototype.slice.call(document.querySelectorAll('.menu-subcat-block .menu-grid'));
    var featured = document.getElementById('menu-view-featured');
    // The featured strip repeats cards from the categories; it is hidden
    // while filtering, so its copies must not count as matches either.
    var cards = Array.prototype.slice.call(document.querySelectorAll('.menu-card[data-search]')).filter(function (c) {
        return !featured || !featured.contains(c);
    });
    var sections = Array.prototype.slice.call(document.querySelectorAll('.menu-cat-section'));
    var blocks = Array.prototype.slice.call(document.querySelectorAll('.menu-subcat-block'));
    var offers = document.getElementById('menu-view-offers');
    var noMatch = document.querySelector('.menu-no-match');
    var clear = document.querySelector('.menu-clear');

    function activeFilters() {
        return chips.filter(function (c) { return c.getAttribute('aria-pressed') === 'true'; })
                    .map(function (c) { return c.getAttribute('data-filter'); });
    }

    function matches(card, query, filters) {
        if (query && card.getAttribute('data-search').indexOf(query) === -1) return false;
        // Chips are AND, so "Offers + Vegetarian" means both, not either.
        for (var i = 0; i < filters.length; i++) {
            var f = filters[i];
            if (f === 'special' && card.getAttribute('data-special') !== '1') return false;
            if (f === 'new' && card.getAttribute('data-new') !== '1') return false;
            if (f.indexOf('diet:') === 0) {
                var want = f.slice(5);
                var have = (card.getAttribute('data-diet') || '').split(' ');
                if (have.indexOf(want) === -1) return false;
            }
        }
        return true;
    }

    function apply() {
        var query = (input && input.value || '').trim().toLowerCase();
        var filters = activeFilters();
        var filtering = query !== '' || filters.length > 0;
        var shown = 0;

        cards.forEach(function (card) {
            var ok = !filtering || matches(card, query, filters);
            card.hidden = !ok;
            if (ok) shown++;
        });

        // A heading above an empty grid reads as a broken page, so a block and
        // its section disappear once nothing inside them is left.
        blocks.forEach(function (b) {
            b.hidden = !b.querySelector('.menu-card:not([hidden])');
        });
        sections.forEach(function (s) {
            s.hidden = !s.querySelector('.menu-card:not([hidden])');
        });
        // Offers are their own cards and are not searchable; hide the strip
        // while filtering rather than leaving it as an unexplained exception.
        if (offers) offers.hidden = filtering;
        if (featured) featured.hidden = filtering;

        if (noMatch) noMatch.hidden = !(filtering && shown === 0);
        if (clearChip) clearChip.hidden = !filtering;
        if (searchToggle) searchToggle.classList.toggle('is-on', query !== '');

        // The buttons under the banner count what is showing, and step aside
        // when nothing in theirs is left.
        document.querySelectorAll('.mh-chip[data-target]').forEach(function (chip) {
            var el = document.getElementById(chip.getAttribute('data-target'));
            var n = el ? el.querySelectorAll('.menu-card:not([hidden])').length : 0;
            var em = chip.querySelector('em');
            if (em) em.textContent = n;
            chip.hidden = filtering && n === 0;
        });

        // The rail counts what is showing, or it contradicts the page.
        document.querySelectorAll('.menu-rail a[href^="#cat-"]').forEach(function (a) {
            var el = document.getElementById(a.getAttribute('href').slice(1));
            // A sub-category link counts its own block; a category link
            // counts the whole section, sub-categories included.
            var scope = el && (el.classList.contains('menu-subcat-block') ? el : el.closest('.menu-sec'));
            if (!scope) return;
            var n = scope.querySelectorAll('.menu-card:not([hidden])').length;
            var count = a.querySelector('.menu-rail-count');
            if (count) count.textContent = n;
            a.hidden = filtering && n === 0;
        });
        if (window.__mhRefresh) window.__mhRefresh();
    }

    // ── Sort ──────────────────────────────────────────────────────────
    // Reorders within each grid, never across the whole menu: the category
    // grouping is the page's structure and "cheapest first" must not flatten
    // it into one list.
    function applySort(mode) {
        grids.forEach(function (grid) {
            var cards = Array.prototype.slice.call(grid.children);
            cards.sort(function (a, b) {
                if (mode === 'price-low' || mode === 'price-high') {
                    var pa = parseFloat(a.getAttribute('data-price')) || 0;
                    var pb = parseFloat(b.getAttribute('data-price')) || 0;
                    if (pa !== pb) return mode === 'price-low' ? pa - pb : pb - pa;
                }
                return (a.getAttribute('data-name') || '')
                    .localeCompare(b.getAttribute('data-name') || '');
            });
            cards.forEach(function (c) { grid.appendChild(c); });
        });
    }
    sorts.forEach(function (btn) {
        btn.addEventListener('click', function () {
            sorts.forEach(function (b) {
                var on = b === btn;
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
                b.classList.toggle('is-active', on);
            });
            applySort(btn.getAttribute('data-sort'));
        });
    });

    // ── Grid / list ───────────────────────────────────────────────────
    // Same localStorage key as the order app, so the choice carries across
    // the two surfaces instead of each one forgetting the other.
    var VIEW_KEY = 'bg-menu-view';
    function setView(mode) {
        if (main) main.classList.toggle('is-list', mode === 'list');
        viewBtns.forEach(function (b) {
            var on = b.getAttribute('data-view') === mode;
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.classList.toggle('is-active', on);
        });
        try { localStorage.setItem(VIEW_KEY, mode); } catch (e) { /* private mode */ }
    }
    viewBtns.forEach(function (b) {
        b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
    });
    try {
        if (localStorage.getItem(VIEW_KEY) === 'list') setView('list');
    } catch (e) { /* private mode */ }

    // ── Rail side ─────────────────────────────────────────────────────
    // Same key as the order app. The early script above the shell already
    // applied a remembered "right"; this just flips it and keeps the
    // button's state honest.
    var RAIL_SIDE_KEY = 'bg-menu-rail-side';
    var railSideBtn = document.getElementById('menuRailSide');
    function syncRailSideBtn() {
        if (!railSideBtn) return;
        var right = document.documentElement.classList.contains('rail-right');
        railSideBtn.setAttribute('aria-pressed', right ? 'true' : 'false');
        railSideBtn.setAttribute('aria-label', right ? 'Move the categories to the left side' : 'Move the categories to the right side');
    }
    if (railSideBtn) {
        railSideBtn.addEventListener('click', function () {
            var right = document.documentElement.classList.toggle('rail-right');
            try { localStorage.setItem(RAIL_SIDE_KEY, right ? 'right' : 'left'); } catch (e) { /* private mode */ }
            syncRailSideBtn();
        });
        syncRailSideBtn();
    }

    // ── Search panel ──────────────────────────────────────────────────
    // Behind the search icon on the pinned banner (owner, 2026-10-07): the
    // field, Grid/List, rail side, Print, sort and filters, out of the way
    // of the food until asked for.
    var panel = document.getElementById('menuSearchPanel');
    function openSearch(open, keep) {
        if (!panel || !searchToggle) return;
        panel.hidden = !open;
        var mh = document.querySelector('[data-mh]');
        if (mh) mh.classList.toggle('has-panel', open);
        searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        // Without preventScroll the phone scrolls the field into view, the
        // site header comes back on that scroll and the banner jumps under it.
        if (open && input) { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }
        // Closed from the panel: focus back on the button that opened it.
        // Closed by a tap elsewhere: that tap decides where focus goes.
        if (!open && !keep && panel.contains(document.activeElement)) { try { searchToggle.focus({ preventScroll: true }); } catch (e) { searchToggle.focus(); } }
        if (!open && keep && document.activeElement === input) input.blur();
        // The button and the ✕ empty the search, so a panel closed on purpose
        // never leaves the menu filtered; a tap elsewhere (keep) leaves the
        // results, since that tap is usually on one of them.
        if (!open && !keep && input && input.value) { input.value = ''; apply(); }
        if (window.__mhRefresh) window.__mhRefresh();
    }
    if (searchToggle) {
        searchToggle.addEventListener('click', function () {
            openSearch(panel.hidden);
        });
    }
    // Owner, 2026-10-07: "it should be hidden on any click outside the box".
    // A tap, not a touch: a finger that scrolls the results ends in
    // pointercancel and leaves the panel open.
    var tapStart = null;
    document.addEventListener('pointerdown', function (e) {
        var t = e.target;
        var inside = t && t.closest && (panel.contains(t) || searchToggle.contains(t));
        tapStart = panel && !panel.hidden && !inside ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    }, true);
    document.addEventListener('pointercancel', function () { tapStart = null; }, true);
    document.addEventListener('pointerup', function (e) {
        var st = tapStart; tapStart = null;
        if (!st || st.id !== e.pointerId || panel.hidden) return;
        if (Math.abs(e.clientX - st.x) + Math.abs(e.clientY - st.y) > 12) return;
        openSearch(false, true);
    }, true);
    if (searchClose) searchClose.addEventListener('click', function () { openSearch(false); });

    if (input) {
        input.addEventListener('input', apply);
        // Escape clears rather than only blurring — a search box you cannot
        // easily empty is how people end up thinking the menu is short.
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (input.value) { input.value = ''; apply(); } else { openSearch(false); }
            }
        });
    }
    chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
            var on = chip.getAttribute('aria-pressed') === 'true';
            chip.setAttribute('aria-pressed', on ? 'false' : 'true');
            apply();
        });
    });
    function clearAll() {
        if (input) input.value = '';
        chips.forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        apply();
    }
    if (clear) clear.addEventListener('click', clearAll);
    if (clearChip) clearChip.addEventListener('click', clearAll);
})();
</script>

{{-- Enhancement only. The rail and the buttons are anchor links and the whole
     menu is already in the HTML; this marks where you are and animates the
     changes (owner, 2026-10-07: the rail holds the main categories, the
     pinned banner shows the one in view with its sub-categories as buttons,
     and the switch from one to the next moves instead of just appearing). --}}
<script nonce="{{ csp_nonce() }}">
(function () {
    var head = document.querySelector('[data-mh]');
    var rail = document.querySelector('.menu-rail');
    if (!head || !rail) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var root = document.documentElement;
    var scroller = rail.querySelector('.menu-rail-scroll') || rail;
    var railList = rail.querySelector('.menu-rail-list');
    var railPill = rail.querySelector('.menu-rail-pill');
    var banner = head.querySelector('.mh-banner');
    var imgs = Array.prototype.slice.call(head.querySelectorAll('.mh-img'));
    var title = head.querySelector('.mh-title');
    var count = head.querySelector('.mh-count');
    var allBtn = head.querySelector('.mh-all');
    var mainCol = document.querySelector('.menu-main');
    var ease = 'cubic-bezier(.2,.7,.2,1)';
    var state = { sec: null, sub: null, y: window.scrollY, lock: null };
    var front = 0;

    function stickyTop() { return parseFloat(getComputedStyle(root).getPropertyValue('--menu-sticky')) || 0; }
    // The line just under the pinned banner: whatever crosses it is "in view".
    // The button row floats under the banner (it does not push the list), so
    // it counts towards the line only while it is showing.
    function underH() { return head.classList.contains('has-row') ? (parseFloat(getComputedStyle(head).getPropertyValue('--mh-bar-h')) || 0) : 0; }
    function line() { return stickyTop() + head.offsetHeight + underH() + 12; }
    function sections() {
        return Array.prototype.slice.call(document.querySelectorAll('.menu-sec')).filter(function (s) { return !s.hidden; });
    }
    function chipsFor(id) { return head.querySelector('.mh-chips[data-sec="' + id + '"]'); }
    function subsOf(sec) {
        var row = chipsFor(sec.id);
        if (!row) return [];
        return Array.prototype.slice.call(row.querySelectorAll('.mh-chip[data-target]')).filter(function (c) { return !c.hidden; })
            .map(function (c) { return document.getElementById(c.getAttribute('data-target')); })
            .filter(function (el) { return el && !el.hidden; });
    }

    // ── Rail ──────────────────────────────────────────────────────────
    // Size the scroller to what is actually on screen (owner, 2026-09-03:
    // "make it scroll till the last cat").
    function fitRail() {
        var top = scroller.getBoundingClientRect().top;
        var room = window.innerHeight - top - 8;
        if (mainCol && mainCol.offsetHeight > 0) room = Math.min(room, mainCol.offsetHeight);
        scroller.style.maxHeight = Math.max(160, room) + 'px';
    }
    // Follow the active entry by scrolling the rail's own scroller only, and
    // never while a finger is on it.
    var touchedAt = 0;
    ['touchstart', 'pointerdown', 'wheel'].forEach(function (ev) {
        scroller.addEventListener(ev, function () { touchedAt = Date.now(); }, { passive: true });
    });
    function revealInRail(el) {
        if (Date.now() - touchedAt < 1500) return;
        var top = el.offsetTop, bottom = top + el.offsetHeight;
        var viewTop = scroller.scrollTop, viewBottom = viewTop + scroller.clientHeight;
        if (top >= viewTop && bottom <= viewBottom) return;
        var target = Math.max(0, top < viewTop ? top - 8 : bottom - scroller.clientHeight + 8);
        scroller.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    }
    function lightRail(id) {
        var on = null;
        rail.querySelectorAll('.menu-rail-list > a').forEach(function (a) {
            var hit = a.getAttribute('data-sec') === id;
            a.classList.toggle('is-active', hit);
            if (hit) { a.setAttribute('aria-current', 'true'); on = a; } else { a.removeAttribute('aria-current'); }
        });
        if (railPill) {
            if (on && !on.hidden) {
                // A ring a few pixels outside the chosen tile.
                railPill.style.transform = 'translateY(' + (on.offsetTop - 3) + 'px)';
                railPill.style.height = (on.offsetHeight + 6) + 'px';
                railPill.classList.add('is-on');
            } else {
                railPill.classList.remove('is-on');
            }
        }
        if (on) revealInRail(on);
    }

    // ── Banner ────────────────────────────────────────────────────────
    // A new section: the photo cross-fades (and settles from a slight zoom),
    // the name rolls up, or down when scrolling back, the buttons slide over.
    function showSection(sec, dir, instant) {
        if (state.sec === sec.id) return;
        var first = state.sec === null;
        var img = sec.getAttribute('data-mh-img');
        banner.style.background = img ? '' : (sec.getAttribute('data-mh-tint') || '');
        var next = imgs[1 - front];
        next.style.backgroundImage = img ? 'url("' + img.replace(/"/g, '%22') + '")' : 'none';
        void next.offsetWidth;
        next.classList.add('is-on'); imgs[front].classList.remove('is-on'); front = 1 - front;

        var old = title.querySelectorAll('span'), span = document.createElement('span');
        span.textContent = sec.getAttribute('data-mh-name') || '';
        if (sec.getAttribute('data-mh-dv')) span.setAttribute('lang', 'dv');
        title.appendChild(span);
        // A fixed width only while the names roll, so the box glides between
        // them; left on, it kept the width measured before the brand font
        // loaded and clipped the name ("Breakfas").
        clearTimeout(title.__w);
        title.style.width = '';
        if (!first && !instant && !reduce && span.animate) {
            title.style.width = span.offsetWidth + 'px';
            title.__w = setTimeout(function () { title.style.width = ''; }, 360);
            var d = dir < 0 ? -1 : 1, opt = { duration: 320, easing: ease };
            span.animate([{ transform: 'translateY(' + (100 * d) + '%)', opacity: 0 }, { transform: 'none', opacity: 1 }], opt);
            Array.prototype.forEach.call(old, function (o) {
                var a = o.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(' + (-100 * d) + '%)', opacity: 0 }], opt);
                a.onfinish = function () { o.remove(); };
            });
        } else {
            Array.prototype.forEach.call(old, function (o) { o.remove(); });
        }
        var n = parseInt(sec.getAttribute('data-mh-count'), 10) || 0;
        count.textContent = n + (n === 1 ? ' item' : ' items');

        head.querySelectorAll('.mh-share').forEach(function (sh) { sh.hidden = sh.getAttribute('data-sec') !== sec.id; });
        // No sub-categories, no row: the banner sits straight on the dishes
        // (owner, 2026-10-07: "if there is no sub category, still there is a
        // white strip under the banner").
        head.classList.toggle('has-row', !!chipsFor(sec.id));
        head.querySelectorAll('.mh-chips').forEach(function (row) {
            var on = row.getAttribute('data-sec') === sec.id;
            var wasOn = row.classList.contains('is-on');
            if (instant || reduce) { row.style.transition = 'none'; }
            row.classList.toggle('is-left', !on && wasOn && dir > 0);
            if (!on && dir < 0) row.classList.remove('is-left');
            row.classList.toggle('is-on', on);
            if (instant || reduce) { void row.offsetWidth; row.style.transition = ''; }
        });
        state.sec = sec.id;
        state.sub = null;
        lightRail(sec.id);
        syncAll();
        requestAnimationFrame(function () { var r = chipsFor(sec.id); if (r) fades(r); });
    }

    // ── Buttons ───────────────────────────────────────────────────────
    function fades(row) {
        row.classList.toggle('fade-l', row.scrollLeft > 4);
        row.classList.toggle('fade-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
    }
    head.querySelectorAll('.mh-chips').forEach(function (row) {
        row.addEventListener('scroll', function () { fades(row); }, { passive: true });
    });
    // The rust pill glides to the button for the sub-category in view, and
    // the row slides so that button sits in the middle.
    function showSub(el) {
        var id = el ? el.id : null;
        if (state.sub === id) return;
        state.sub = id;
        var row = chipsFor(state.sec);
        if (!row) return;
        var chip = id ? row.querySelector('.mh-chip[data-target="' + id + '"]') : null;
        row.querySelectorAll('.mh-chip').forEach(function (c) {
            var on = c === chip;
            c.classList.toggle('is-active', on);
            if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
        });
        var pill = row.querySelector('.mh-pill');
        if (!chip) { pill.style.width = '0px'; return; }
        pill.style.width = chip.offsetWidth + 'px';
        pill.style.transform = 'translateX(' + chip.offsetLeft + 'px)';
        row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
    }
    // "All" when the buttons do not fit (owner, 2026-10-07).
    function syncAll() {
        var row = chipsFor(state.sec);
        var show = !!row && row.scrollWidth > row.clientWidth + 2;
        if (show && allBtn.hidden && !reduce) { allBtn.classList.remove('is-new'); void allBtn.offsetWidth; allBtn.classList.add('is-new'); }
        allBtn.hidden = !show;
    }

    // ── Where are we ──────────────────────────────────────────────────
    function spy() {
        var dir = window.scrollY >= state.y ? 1 : -1;
        state.y = window.scrollY;
        head.classList.toggle('is-stuck', head.getBoundingClientRect().top <= stickyTop() + 1);
        // A tap is travelling: keep its target lit rather than flickering
        // through every button on the way.
        if (state.lock) return;
        var secs = sections();
        if (!secs.length) return;
        var at = line(), cur = secs[0];
        secs.forEach(function (s) { if (s.getBoundingClientRect().top <= at) cur = s; });
        var subs = subsOf(cur), sub = subs[0] || null;
        subs.forEach(function (x) { if (x.getBoundingClientRect().top <= at) sub = x; });
        // The bottom of the page: the last sub-category may never reach the line.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
            cur = secs[secs.length - 1]; subs = subsOf(cur); sub = subs[subs.length - 1] || null;
        }
        showSection(cur, dir);
        showSub(sub);
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { ticking = false; headerOnScroll(); fitRail(); spy(); });
    }, { passive: true });
    window.addEventListener('resize', function () { state.sub = null; fitRail(); if (state.sec) lightRail(state.sec); syncAll(); spy(); });

    // ── Going somewhere ───────────────────────────────────────────────
    // A tap switches everything to the target at once, the page glides
    // there, and on arrival the label flashes and the first dishes rise.
    function targetY(el) {
        return window.scrollY + el.getBoundingClientRect().top - stickyTop() - head.offsetHeight - underH() + 2;
    }
    // ── Phone: the site header gets out of the way ───────────────────
    // Down: it slides up and the banner takes its place. Up a little: it
    // comes back. Near the top of the page it always shows.
    var phoneMq = window.matchMedia ? window.matchMedia('(max-width: 768px)') : null;
    var headerAway = false, lastHY = window.scrollY, upTravel = 0;
    function setHeaderAway(on) {
        on = !!on && !!phoneMq && phoneMq.matches;
        if (headerAway === on) return;
        headerAway = on;
        root.classList.toggle('menu-header-away', on);
    }
    function headerOnScroll() {
        var y = window.scrollY, dy = y - lastHY;
        lastHY = y;
        if (!phoneMq || !phoneMq.matches) { setHeaderAway(false); return; }
        // A tap is travelling; goTo has already decided.
        if (state.lock) return;
        // Typing: the keyboard opening scrolls the page, which is not the
        // customer scrolling, so the header stays as it is.
        if (document.activeElement && document.activeElement.id === 'menuSearch') return;
        if (y < 120) { upTravel = 0; setHeaderAway(false); return; }
        if (dy > 4) { upTravel = 0; setHeaderAway(true); }
        else if (dy < 0) { upTravel -= dy; if (upTravel > 24) setHeaderAway(false); }
    }

    function goTo(el, instant) {
        var sec = el.classList.contains('menu-sec') ? el : el.closest('.menu-sec');
        if (!sec) return;
        var dir = el.getBoundingClientRect().top > line() ? 1 : -1;
        // Going down the header leaves, going up it returns; decide first so
        // the landing spot is measured with the header as it will be.
        setHeaderAway(dir > 0 || (instant && el.getBoundingClientRect().top > 200));
        showSection(sec, dir, instant);
        showSub(el === sec ? (subsOf(sec)[0] || null) : el);
        var y = targetY(el);
        if (instant || reduce) {
            window.scrollTo(0, y);
            state.y = window.scrollY;
            return;
        }
        state.lock = el;
        var done = function () {
            if (state.lock !== el) return;
            state.lock = null;
            var block = el.classList.contains('menu-subcat-block') ? el : null;
            var label = block && block.querySelector('.menu-subcat-title');
            if (label) { label.classList.remove('is-arrived'); void label.offsetWidth; label.classList.add('is-arrived'); }
            if (block) {
                block.classList.add('is-arrived');
                setTimeout(function () { block.classList.remove('is-arrived'); }, 900);
            }
        };
        window.scrollTo({ top: y, behavior: 'smooth' });
        var timer = setTimeout(done, 1200);
        window.addEventListener('scrollend', function f() { window.removeEventListener('scrollend', f); clearTimeout(timer); done(); });
    }
    function targetOf(href) {
        if (!href || href.charAt(0) !== '#') return null;
        return document.getElementById(href.slice(1));
    }
    head.addEventListener('click', function (e) {
        var chip = e.target.closest('.mh-chip[data-target]');
        if (!chip) return;
        var el = document.getElementById(chip.getAttribute('data-target'));
        if (!el) return;
        e.preventDefault();
        goTo(el);
    });
    rail.addEventListener('click', function (e) {
        var a = e.target.closest('.menu-rail-list > a');
        var el = a && targetOf(a.getAttribute('href'));
        if (!el) return;
        e.preventDefault();
        goTo(el);
    });

    // ── All ───────────────────────────────────────────────────────────
    var scrim = document.querySelector('[data-mh-scrim]');
    var sheet = document.querySelector('[data-mh-sheet]');
    var list = sheet && sheet.querySelector('.mh-sheet-list');
    var lastFocus = null;
    function openAll() {
        var row = chipsFor(state.sec);
        if (!row || !sheet) return;
        var sec = document.getElementById(state.sec);
        sheet.querySelector('.mh-sheet-title').textContent = sec ? (sec.getAttribute('data-mh-name') || '') : '';
        var chips = Array.prototype.slice.call(row.querySelectorAll('.mh-chip[data-target]')).filter(function (c) { return !c.hidden; });
        sheet.querySelector('.mh-sheet-count').textContent = chips.length + ' sections';
        list.innerHTML = '';
        chips.forEach(function (c, i) {
            var li = document.createElement('li'), b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('data-target', c.getAttribute('data-target'));
            if (c.getAttribute('data-target') === state.sub) b.className = 'is-active';
            var dot = document.createElement('i'), name = document.createElement('b'), n = document.createElement('span');
            name.textContent = c.firstChild ? c.firstChild.textContent : c.textContent;
            if (c.getAttribute('lang')) name.setAttribute('lang', c.getAttribute('lang'));
            name.style.fontWeight = 'inherit';
            var em = c.querySelector('em');
            n.textContent = (em ? em.textContent : '') + ' items';
            b.appendChild(dot); b.appendChild(name); b.appendChild(n);
            li.style.transitionDelay = reduce ? '0ms' : (40 + i * 25) + 'ms';
            li.appendChild(b); list.appendChild(li);
        });
        if (window.matchMedia('(min-width: 769px)').matches) {
            sheet.style.top = (head.getBoundingClientRect().bottom + 6) + 'px';
        } else {
            sheet.style.top = '';
        }
        lastFocus = document.activeElement;
        scrim.hidden = false; sheet.hidden = false;
        void sheet.offsetWidth;
        scrim.classList.add('is-open'); sheet.classList.add('is-open');
        var focusEl = list.querySelector('.is-active') || sheet.querySelector('.mh-sheet-x');
        if (focusEl) focusEl.focus({ preventScroll: true });
    }
    function closeAll() {
        if (!sheet || sheet.hidden) return;
        scrim.classList.remove('is-open'); sheet.classList.remove('is-open');
        setTimeout(function () { scrim.hidden = true; sheet.hidden = true; }, reduce ? 0 : 320);
        if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    if (allBtn) allBtn.addEventListener('click', openAll);
    if (scrim) scrim.addEventListener('click', closeAll);
    if (sheet) {
        sheet.querySelector('.mh-sheet-x').addEventListener('click', closeAll);
        list.addEventListener('click', function (e) {
            var b = e.target.closest('button[data-target]');
            var el = b && document.getElementById(b.getAttribute('data-target'));
            if (!el) return;
            closeAll();
            setTimeout(function () { goTo(el); }, reduce ? 0 : 180);
        });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

    // The filter script calls this after it hides or shows cards.
    window.__mhRefresh = function () {
        state.sub = null;
        var cur = state.sec && document.getElementById(state.sec);
        if (cur && cur.hidden) state.sec = null;
        if (state.sec) lightRail(state.sec);
        syncAll();
        spy();
    };

    // ── First paint ───────────────────────────────────────────────────
    // A shared category link (/menu/c/...) or an address with #section opens
    // the menu already there, without the glide.
    fitRail();
    var start = document.querySelector('.menu-shell[data-menu-start]');
    var startEl = (start && document.getElementById(start.getAttribute('data-menu-start'))) || targetOf(window.location.hash);
    if (startEl && (startEl.classList.contains('menu-sec') || startEl.classList.contains('menu-subcat-block'))) {
        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
        requestAnimationFrame(function () { goTo(startEl, true); });
    } else {
        spy();
    }
})();
</script>
@include('partials.menu-favourite-script')

{{-- ── Item sheet ─────────────────────────────────────────────────────────
     Tapping a card used to be a page load: a blank flash, the header
     redrawn, then the item. The order app opens the same thing as a sheet
     and feels immediate, and the owner asked why the website could not.

     It can, and without giving anything up. The cards stay real <a href>
     links, so a crawler follows them to the full /menu/{id} document exactly
     as before and nothing about indexing changes. The sheet is layered on
     top: the tap is intercepted, the item's body is fetched on its own, and
     the address bar is moved to the item URL with pushState — so Share, a
     copied link and the back button all behave as if the page had loaded.

     Every failure falls back to the plain navigation. No JS, an old browser,
     a dropped request, a slow network: the link just works, the way it does
     today. That is the whole safety argument for touching the busiest page
     on the site. --}}
<div class="menu-sheet-backdrop" data-sheet-backdrop hidden></div>
<div class="menu-sheet" data-sheet role="dialog" aria-modal="true" aria-label="Menu item" hidden>
    {{-- A bar of its own, so the sheet's controls stop competing with the
         item's. Floating the close button over the hero put it on top of the
         favourite heart, and hiding the "Full menu" link left Share stranded
         against the left edge. --}}
    <div class="menu-sheet-head">
        <div class="menu-sheet-grab" aria-hidden="true"></div>
    </div>
    <div class="menu-sheet-body" data-sheet-body></div>
</div>

<script nonce="{{ csp_nonce() }}">
(function () {
    var sheet = document.querySelector('[data-sheet]');
    var backdrop = document.querySelector('[data-sheet-backdrop]');
    var body = document.querySelector('[data-sheet-body]');
    if (!sheet || !backdrop || !body || !window.fetch || !window.history || !history.pushState) return;

    var open = false;
    var menuUrl = location.pathname + location.search;
    var lastFocus = null;
    var cache = {};
    var inflight = {};

    function setOpen(on) {
        open = on;
        sheet.hidden = !on;
        backdrop.hidden = !on;
        // The page behind must not scroll under the sheet — on iOS that
        // reads as the sheet sliding off its own content.
        document.body.classList.toggle('menu-sheet-open', on);
        if (on) {
            window.requestAnimationFrame(function () { sheet.classList.add('is-open'); });
        } else {
            sheet.classList.remove('is-open');
            body.innerHTML = '';
            if (lastFocus && lastFocus.focus) lastFocus.focus();
        }
    }

    function render(html) {
        body.innerHTML = html;
        sheet.scrollTop = 0;
        // Share controls arrive with the fragment and bind on demand;
        // favourites are delegated from the document and need nothing.
        if (window.__shareInit) window.__shareInit();
        var heading = body.querySelector('h1');
        if (heading) sheet.setAttribute('aria-label', heading.textContent || 'Menu item');
    }

    function load(href) {
        if (cache[href]) { render(cache[href]); return Promise.resolve(true); }
        // A warm-up started on touch-down is usually already in the air.
        if (inflight[href]) {
            return inflight[href].then(function (html) {
                if (!html) throw new Error('warm failed');
                render(html);
                return true;
            });
        }

        return fetch(href, {
            credentials: 'same-origin',
            headers: { 'X-Menu-Sheet': '1', 'Accept': 'text/html' }
        }).then(function (res) {
            if (!res.ok) throw new Error('sheet fetch failed');
            return res.text();
        }).then(function (html) {
            cache[href] = html;
            render(html);
            return true;
        });
    }

    document.addEventListener('click', function (e) {
        var link = e.target.closest ? e.target.closest('.menu-card-link') : null;
        if (!link) return;
        // Leave every deliberate "open elsewhere" gesture alone.
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

        var href = link.getAttribute('href');
        if (!href || href.charAt(0) !== '/') return;

        e.preventDefault();
        lastFocus = link;
        setOpen(true);
        body.innerHTML = '<p class="menu-sheet-loading">Loading…</p>';
        history.pushState({ menuSheet: href }, '', href);

        load(href).catch(function () {
            // Whatever went wrong, the customer still gets the item — just
            // the slow way, which is what they had before any of this.
            window.location = href;
        });
    });

    function close() {
        if (!open) return;
        // Back rather than replace, so the sheet takes one entry in history
        // and the URL returns to the menu the customer came from.
        if (history.state && history.state.menuSheet) history.back();
        else { setOpen(false); history.replaceState({}, '', menuUrl); }
    }

    // Delegated: the close button arrives with the fetched item, not with the
    // page, so nothing can be bound to it up front.
    document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-sheet-close]')) { e.preventDefault(); close(); }
    });
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    // Sizes are a choice, so picking one here carries into the order app —
    // a customer who has decided on Large should not decide again next screen.
    document.addEventListener('click', function (e) {
        var chip = e.target.closest ? e.target.closest('[data-size]') : null;
        if (!chip) return;
        var group = chip.closest('[data-sizes]');
        if (!group) return;

        var on = chip.getAttribute('aria-pressed') === 'true';
        group.querySelectorAll('[data-size]').forEach(function (el) {
            el.setAttribute('aria-pressed', 'false');
        });
        chip.setAttribute('aria-pressed', on ? 'false' : 'true');

        var add = document.querySelector('[data-add-to-order]');
        if (!add) return;
        var itemId = add.getAttribute('data-item');
        add.setAttribute(
            'href',
            on ? '/order/menu?item=' + itemId
               : '/order/menu?item=' + itemId + '&variant=' + chip.getAttribute('data-variant')
        );
    });

    // Warm the fetch on touch-down rather than on the click that follows it.
    // A tap is 100-300ms of finger travel; spending it on the request is the
    // difference between "opens" and "opens after a beat". Owner, 2026-09-01:
    // "when item is clicked it takes some time to open".
    function warm(e) {
        var link = e.target.closest ? e.target.closest('.menu-card-link') : null;
        if (!link) return;
        var href = link.getAttribute('href');
        if (!href || href.charAt(0) !== '/' || cache[href] || inflight[href]) return;
        inflight[href] = fetch(href, {
            credentials: 'same-origin',
            headers: { 'X-Menu-Sheet': '1', 'Accept': 'text/html' }
        }).then(function (res) {
            if (res.ok) return res.text();
            throw new Error('warm failed');
        }).then(function (html) {
            cache[href] = html;
            return html;
        }).catch(function () { delete inflight[href]; });
    }
    document.addEventListener('pointerdown', warm, { passive: true });
    document.addEventListener('mouseover', warm, { passive: true });

    window.addEventListener('popstate', function (e) {
        var state = e.state;
        if (state && state.menuSheet) {
            setOpen(true);
            load(state.menuSheet).catch(function () { window.location = state.menuSheet; });
            return;
        }
        if (open) setOpen(false);
    });
})();
</script>
@endsection
