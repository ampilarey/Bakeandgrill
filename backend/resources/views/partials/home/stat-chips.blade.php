@php
    $proofStat = content('proof_stat', '');
    $proofLabel = content('proof_label', '');
@endphp
@if($proofStat !== '' || $proofLabel !== '')
<section class="home-stat-chips" data-home-block="stat_chips" style="padding:0.75rem 1.5rem; max-width:960px; margin:0 auto;">
    <div style="display:inline-flex; gap:0.5rem; flex-wrap:wrap;">
        @if($proofStat !== '')
            <span style="display:inline-flex; align-items:center; min-height:36px; padding:0 0.85rem; border-radius:999px; background:var(--surface); border:1px solid var(--border); font-weight:700; font-size:0.85rem;">
                {{ $proofStat }}@if($proofLabel !== '') <span style="font-weight:500; color:var(--muted); margin-left:0.35rem;">{{ $proofLabel }}</span>@endif
            </span>
        @endif
    </div>
</section>
@endif
