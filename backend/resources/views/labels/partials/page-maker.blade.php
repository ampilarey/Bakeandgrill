{{-- Who made it: the business's logo, name and tagline, how to reach it, and the way to order more. @var array<string, string> $maker --}}
<div class="lp-maker" data-testid="label-page-maker">
    <div class="lp-maker-top">
        <img src="{{ $maker['logo'] }}" alt="">
        <div>
            <small>Made by</small>
            <strong>{{ $maker['name'] }}</strong>
            <em>{{ $maker['tagline'] }}</em>
        </div>
    </div>
    <ul class="lp-maker-lines">
        @if ($maker['phone'] !== '')<li>Call <a href="tel:{{ preg_replace('/[^0-9+]/', '', $maker['phone']) }}">{{ $maker['phone'] }}</a></li>@endif
        @if ($maker['address'] !== '')<li>{{ $maker['address'] }}@if ($maker['landmark'] !== ''), {{ $maker['landmark'] }}@endif</li>@endif
        @if ($maker['website'] !== '')<li><a href="{{ url('/') }}">{{ $maker['website'] }}</a></li>@endif
    </ul>
    <div class="lp-actions">
        <a class="lp-btn gold" href="{{ $maker['order_url'] }}">Order online</a>
        <a class="lp-btn line" href="{{ $menuUrl }}">See the menu</a>
    </div>
</div>
