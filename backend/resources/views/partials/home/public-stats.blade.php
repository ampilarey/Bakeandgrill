{{--
    "Public counters" home block — placed and configured in the Customer
    Surface Builder. $settings (the block's settings) picks which counters
    show; values come rounded ("12,500+") from PublicSiteStats and counters
    at zero hide themselves. Renders nothing when every counter is hidden.
--}}
@php
    $publicStats = app(\App\Domains\Reporting\Services\PublicSiteStats::class)
        ->statsForBlock($settings ?? []);
@endphp
@if(count($publicStats) > 0)
<section class="stats-strip" data-testid="public-stats">
    <div class="stats-strip-inner">
        @foreach($publicStats as $stat)
            <div class="stats-strip-item">
                <span class="stats-strip-value">{{ $stat['display'] }}</span>
                <span class="stats-strip-label">{{ $stat['label'] }}</span>
            </div>
        @endforeach
    </div>
</section>
<style>
.stats-strip { padding: 2rem 1.25rem; background: var(--amber-light, #FEF3E8); }
.stats-strip-inner {
    max-width: 900px; margin: 0 auto; display: flex; flex-wrap: wrap;
    justify-content: center; gap: 1.5rem 3rem; text-align: center;
}
.stats-strip-item { display: flex; flex-direction: column; gap: 0.15rem; min-width: 8rem; }
.stats-strip-value {
    font-size: 2rem; font-weight: 800; letter-spacing: -0.03em;
    color: var(--amber, #D4813A); font-variant-numeric: tabular-nums;
}
.stats-strip-label { font-size: 0.85rem; font-weight: 600; color: var(--muted, #6b5d4f); }
</style>
@endif
