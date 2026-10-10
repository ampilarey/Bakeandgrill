<div class="home-mode-card__media" aria-hidden="true">
    @if(!empty($card['image']))
        <img src="{{ $card['image'] }}" alt="" loading="lazy">
    @endif
    @php $modeIcon = \App\Support\UiIcon::forEmoji((string) $card['icon']); @endphp
    <span class="home-mode-card__icon">{{ $modeIcon ? \App\Support\UiIcon::svg($modeIcon, 40) : $card['icon'] }}</span>
</div>
<div class="home-mode-card__body">
    <p class="home-mode-card__label">{{ $card['label'] }}</p>
    <p class="home-mode-card__hint">{{ $card['hint'] }}</p>
    <div class="home-mode-card__cta">{{ $card['cta'] }}</div>
</div>
