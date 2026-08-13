@php
    $modeCards = \App\Domains\Content\ModeEntryCardsPresenter::cards();
@endphp
<section
    class="home-mode-cards"
    data-home-block="mode_cards"
    aria-label="Choose order mode"
>
    <div class="home-mode-cards__row mode-entry-cards">
        @foreach($modeCards as $card)
            @if($card['available'] && $card['href'])
                <a
                    href="{{ $card['href'] }}"
                    class="home-mode-card"
                    data-testid="mode-entry-{{ $card['kind'] }}"
                    data-available="true"
                    aria-label="{{ $card['label'] }}"
                >
                    @include('partials.home.mode-card-inner', ['card' => $card])
                </a>
            @else
                <button
                    type="button"
                    class="home-mode-card"
                    data-testid="mode-entry-{{ $card['kind'] }}"
                    data-available="false"
                    aria-label="{{ $card['status_line'] ? $card['label'].'. '.$card['status_line'] : $card['label'] }}"
                    data-mode-info="{{ $card['kind'] }}"
                >
                    @include('partials.home.mode-card-inner', ['card' => $card])
                </button>
            @endif
        @endforeach
    </div>

    @foreach($modeCards as $card)
        @unless($card['available'])
            <dialog class="home-mode-info" id="mode-info-{{ $card['kind'] }}" data-testid="mode-info-{{ $card['kind'] }}">
                <form method="dialog" class="home-mode-info__panel">
                    <header class="home-mode-info__head">
                        <h2 class="home-mode-info__title">{{ $card['label'] }}</h2>
                        <button type="submit" class="home-mode-info__close" aria-label="Close">×</button>
                    </header>
                    <p class="home-mode-info__status" data-testid="mode-info-status">{{ $card['status_line'] }}</p>
                    <p class="home-mode-info__body" data-testid="mode-info-body">{{ $card['info'] }}</p>
                    <button type="submit" class="home-mode-info__done">Close</button>
                </form>
            </dialog>
        @endunless
    @endforeach
</section>

<style>
/* Keep in lockstep with order-app ModeEntryCards (flex 1 1 0, min-width 0). */
.home-mode-cards {
    padding: 1rem 1.25rem 1.25rem;
    max-width: 960px;
    margin: 0 auto;
}
/* Desktop: same 1280 rail as header / sections (not the narrower 960 card column) */
@media (min-width: 769px) {
    .home-mode-cards {
        max-width: var(--desktop-content-max, 1280px);
        width: 100%;
        margin-inline: auto;
        padding-inline: var(--desktop-page-gutter, 2rem);
        box-sizing: border-box;
    }
}
.home-mode-cards__row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.875rem;
}
.home-mode-card {
    flex: 1 1 0;
    min-width: 0;
    border: 1.5px solid var(--border);
    border-radius: 1.25rem;
    overflow: hidden;
    background: var(--surface);
    cursor: pointer;
    padding: 0;
    text-align: left;
    font-family: inherit;
    min-height: 44px;
    color: inherit;
    text-decoration: none;
    display: block;
    box-shadow: none;
    appearance: none;
    -webkit-appearance: none;
}
.home-mode-card[data-available="false"] {
    opacity: 0.88;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.04);
}
.home-mode-card__media {
    height: 120px;
    overflow: hidden;
    background: linear-gradient(145deg, var(--amber-light) 0%, var(--surface-alt) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.75rem;
    position: relative;
}
.home-mode-card[data-available="false"] .home-mode-card__media {
    filter: grayscale(0.35);
}
.home-mode-card__media img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
}
.home-mode-card__media:has(img) .home-mode-card__icon {
    display: none;
}
.home-mode-card__body {
    padding: 0.875rem 1rem 1rem;
}
.home-mode-card__label {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    color: var(--dark);
}
.home-mode-card__hint {
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--muted);
    line-height: 1.4;
}
.home-mode-card__cta {
    margin-top: 0.625rem;
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--amber);
}
.home-mode-card[data-available="false"] .home-mode-card__cta {
    color: var(--muted);
}
.home-mode-info {
    border: none;
    border-radius: 1rem;
    padding: 0;
    max-width: min(420px, calc(100vw - 2rem));
    width: 100%;
    background: transparent;
}
.home-mode-info::backdrop {
    background: rgba(28, 20, 8, 0.45);
}
.home-mode-info__panel {
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 1rem;
    padding: 1.25rem 1.25rem 1.35rem;
}
.home-mode-info__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
}
.home-mode-info__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--dark);
}
.home-mode-info__close {
    border: none;
    background: transparent;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    color: var(--muted);
    min-width: 44px;
    min-height: 44px;
}
.home-mode-info__status {
    margin: 0 0 0.875rem;
    display: inline-block;
    font-size: 0.8125rem;
    font-weight: 700;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    background: var(--surface-alt);
    color: var(--text);
}
.home-mode-info__body {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.55;
    color: var(--text);
}
.home-mode-info__done {
    margin-top: 1.25rem;
    width: 100%;
    min-height: 44px;
    border: 1.5px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    font-weight: 700;
    font-size: 0.9375rem;
    cursor: pointer;
    font-family: inherit;
    color: var(--text);
}
</style>

<script nonce="{{ csp_nonce() }}">
(function () {
    document.querySelectorAll('[data-mode-info]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var kind = btn.getAttribute('data-mode-info');
            var dlg = document.getElementById('mode-info-' + kind);
            if (dlg && typeof dlg.showModal === 'function') {
                dlg.showModal();
            }
        });
    });
})();
</script>
