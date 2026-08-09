{{-- Trust micro-strip: fixed chrome under the hero slot, not a page block.
     Shared by the page_blocks path and the legacy degrade path so both
     render identical markup. Expects $trustItems from home.blade.php. --}}
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
