{{-- The item view's own CSS, shared by the page and the sheet.

     It used to live in menu-item.blade.php's @section('styles'). That works
     for the full page, whose layout renders the section — but the menu's item
     sheet fetches the content section ALONE, so the markup arrived with none
     of its styling: an uncontained logo filling the screen, the share button
     hanging off the edge, no padding anywhere. Owner, 2026-09-01: "its a mess
     now".

     So the rules live here and both containers include them. The menu page
     pulls them in whether or not a sheet is ever opened — a few hundred bytes
     against a broken panel on first tap. --}}
<style>
/* Sized and spaced to match the order app's item sheet (ItemSheet.tsx), so a
   customer arriving from a shared link sees the same dish presented the same
   way they would inside the app. Owner, 2026-09-01: "the way item details
   shows on blade menu and order app menu is different". The sheet is a 480px
   panel, so this page is too. */
.menu-item-page { max-width: 480px; margin: 0 auto; padding: 1.25rem 1.25rem 4rem; }
/* Back on the left, Share on the right — the sheet's top row. */
.menu-item-topbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-bottom: 0.35rem;
}
.menu-item-back {
    display: inline-flex; align-items: center; gap: 6px;
    min-height: 44px;
    font-size: 0.95rem; font-weight: 700; color: var(--amber); text-decoration: none;
}
.menu-item-back:hover { text-decoration: underline; }
/* The sheet's share control is a compact pill in the top row, not a
   full-width button in the action stack. */
.menu-item-topbar .share-control-btn {
    min-height: 44px; padding: 0.5rem 1rem;
    font-size: 0.95rem; font-weight: 700;
}
/* The shared partial opens its popover upward and left-aligned, which suits a
   control at the foot of a page. From the top-right corner that would run off
   the top of the viewport and off the right edge, so flip it: drop down, align
   to the button's right. */
.menu-item-topbar .share-popover {
    top: calc(100% + 0.4rem); bottom: auto;
    left: auto; right: 0;
    max-width: min(20rem, calc(100vw - 2.5rem));
}
.menu-item-hero {
    position: relative;
    aspect-ratio: 16 / 10;
    border-radius: 16px;
    overflow: hidden;
    background: var(--amber-light);
    display: flex; align-items: center; justify-content: center;
    font-size: 2.75rem;
    margin-bottom: 1.15rem;
}
/* <picture> is an inline wrapper with no size of its own — without this the
   img sizes against a shrink-to-fit box and object-fit has nothing to cover. */
.menu-item-hero picture { display: block; width: 100%; height: 100%; }
.menu-item-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* A real photo fills the hero — cropping a plate of food is fine. The site
   stand-in is the logo, and cropping that slices the flame off the top and the
   wordmark off the bottom, which is what an item with no photo used to show.
   The backdrop matches the stand-in's own background so the contained image
   reads as one panel instead of a black square floating on cream. Sampled from
   the current stand-in, which is solid #000 to every edge; if that image is
   ever replaced with one on a different ground, this is the value to change. */
.menu-item-hero--placeholder {
    background: var(--menu-placeholder-bg, #000);
}
.menu-item-hero--placeholder img {
    object-fit: contain;
    padding: 4%;
    box-sizing: border-box;
}
.menu-item-page .menu-fav {
    display: none;
    /* 40px at 12px inset — the sheet's heart button. */
    position: absolute; top: 12px; right: 12px;
    z-index: 1;
    min-width: 40px; min-height: 40px; width: 40px; height: 40px;
    padding: 0; border: none; border-radius: 999px;
    background: rgba(255,253,249,0.92);
    box-shadow: 0 1px 5px rgba(28,20,8,0.12);
    cursor: pointer;
    align-items: center; justify-content: center;
    font-size: 1rem; line-height: 1;
    text-decoration: none;
}
html.js .menu-item-page .menu-fav { display: inline-flex; }
/* 1.35rem/800, no tracking — the sheet's title. */
.menu-item-name {
    margin: 0 0 0.2rem;
    font-size: 1.35rem; font-weight: 800;
    color: var(--dark); line-height: 1.25;
}
.menu-item-name-alt {
    margin: 0 0 0.55rem;
    font-size: 0.95rem; color: var(--muted); font-weight: 500;
}
.menu-item-price {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.45rem;
    margin: 0 0 0.85rem;
    font-size: 1.15rem; font-weight: 800; color: var(--amber);
}
.menu-item-from { font-size: 0.8rem; font-weight: 600; }
.menu-item-was {
    font-size: 0.85rem; font-weight: 500; text-decoration: line-through;
    color: var(--muted);
}
.menu-item-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 0.85rem; }
.menu-item-chip {
    font-size: 0.75rem; font-weight: 700; color: var(--dark);
    background: var(--bg); padding: 0.28rem 0.65rem;
    border-radius: 999px; border: 1px solid var(--border);
}
.menu-item-diet { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 0.85rem; }
.menu-item-diet span {
    font-size: 0.7rem; font-weight: 700; text-transform: capitalize;
    color: var(--amber); background: var(--amber-light);
    padding: 0.22rem 0.55rem; border-radius: 999px;
}
.menu-item-desc {
    margin: 0 0 1rem;
    font-size: 0.95rem; line-height: 1.55; color: var(--muted);
    white-space: pre-line;
}
.menu-item-allergens {
    margin: 0 0 1.1rem; padding: 0.75rem 0.9rem;
    background: #FFF7ED; border: 1px solid #FDBA74; border-radius: 12px;
}
.menu-item-allergens p { margin: 0; }
.menu-item-allergens-label {
    font-size: 0.78rem; font-weight: 800; color: #9A3412; letter-spacing: 0.02em;
}
.menu-item-allergens-list {
    margin-top: 0.25rem;
    font-size: 0.85rem; color: #7C2D12; text-transform: capitalize; line-height: 1.4;
}
/* What is in a bundle, and what you choose on a platter. The website used to
   show a bundle's name and price and nothing else, so the one question a
   bundle raises went unanswered here while the order app answered it
   (owner's audit, 2026-09-06, F7). */
.menu-item-bundle {
    margin: 0 0 1.1rem; padding: 0.8rem 0.95rem;
    background: var(--card, #fff);
    border: 1px solid var(--border); border-radius: 12px;
}
.menu-item-bundle-label {
    margin: 0 0 0.5rem;
    font-size: 0.78rem; font-weight: 800;
    letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--muted);
}
.menu-item-bundle-list { margin: 0; padding: 0; list-style: none; }
.menu-item-bundle-list li {
    display: flex; gap: 0.5rem;
    padding: 0.22rem 0;
    font-size: 0.92rem; color: var(--dark); line-height: 1.45;
}
.menu-item-bundle-qty { font-weight: 700; color: var(--muted); min-width: 1.6rem; }
.menu-item-bundle-optional {
    font-size: 0.8rem; color: var(--muted); font-style: italic;
}
.menu-item-bundle-group { margin-top: 0.7rem; }
.menu-item-bundle-group:first-of-type { margin-top: 0; }
.menu-item-bundle-group-head {
    margin: 0 0 0.2rem;
    font-size: 0.9rem; font-weight: 700; color: var(--dark);
}
.menu-item-bundle-pick {
    margin-left: 0.4rem;
    font-size: 0.8rem; font-weight: 600; color: var(--muted);
}
.menu-item-bundle-choices {
    margin: 0; font-size: 0.88rem; color: var(--muted); line-height: 1.5;
}
.menu-item-bundle-save {
    margin: 0.6rem 0 0;
    font-size: 0.85rem; font-weight: 700; color: #15803D;
}

/* Sizes as chips, the way the order app's sheet shows them. They used to be
   a two-column price list, which reads as information rather than a choice. */
.menu-item-sizes {
    margin: 0 0 1.25rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--border);
}
.menu-item-sizes-label {
    margin: 0 0 0.6rem;
    font-size: 0.9rem; font-weight: 700; color: var(--dark);
}
.menu-item-size-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.menu-item-size {
    display: inline-flex; align-items: baseline; gap: 0.5rem;
    min-height: 44px;
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--border); border-radius: 12px;
    background: var(--card, #fff);
    font-family: inherit; font-size: 0.95rem; color: var(--dark);
    cursor: pointer;
}
.menu-item-size[aria-pressed="true"] {
    border-color: var(--amber);
    background: var(--amber-light);
    box-shadow: inset 0 0 0 1px var(--amber);
}
.menu-item-size-name { font-weight: 700; }
.menu-item-size-price { font-weight: 600; color: var(--amber); }
.menu-item-size .menu-item-was { margin-left: 0.3rem; font-size: 0.8rem; color: var(--muted); }
/* One row, two buttons of equal weight and height. Before this the primary
   action was unstyled text (.btn-primary was defined only on the home page)
   sitting next to a pill-shaped secondary, so the page read as though "View
   cart" were the thing to press. */
/* The sheet ends in one full-width primary action with the secondary beneath,
   rather than two buttons splitting a row. */
.menu-item-actions {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-top: 1.5rem;
}
.menu-item-actions .btn-primary,
.menu-item-actions .btn-outline {
    width: 100%;
    border-radius: 14px;
    font-weight: 800;
}
.menu-item-unavailable {
    margin: 0 0 1rem; padding: 0.75rem 0.9rem;
    background: var(--amber-light); border: 1px solid var(--border); border-radius: 12px;
}
.menu-item-unavailable p { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--dark); }
.menu-item-unavailable-note { margin-top: 0.3rem !important; font-weight: 500 !important; color: var(--muted) !important; }
.menu-item-alts { margin: 1.25rem 0 0; }
.menu-item-alts h2 { margin: 0 0 0.6rem; font-size: 1rem; }
.menu-item-alts ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.menu-item-alts a { color: var(--amber); font-weight: 600; text-decoration: none; }
@media (max-width: 768px) {
    .menu-item-page { padding: 1rem 1rem 5rem; }
}
</style>
