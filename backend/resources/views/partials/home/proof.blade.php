@php
    $reviewSectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'section' : 'section alt';
@endphp

<section class="proof-strip">
    <div class="proof-inner">
        <div class="proof-eyebrow">{{ $homeProofEyebrow }}</div>
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

@if($featuredReviews->isNotEmpty())
<section class="{{ $reviewSectionClass }}">
    <div class="section-inner">
        <div class="section-header">
            <span class="section-eyebrow">What guests say</span>
            <h2 class="section-title">Recent reviews</h2>
            <p class="section-sub">Real feedback from people who ordered with us.</p>
        </div>
        <div class="location-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
            @foreach($featuredReviews as $review)
                <div class="loc-card" style="min-height:auto;">
                    <div class="loc-card-accent"></div>
                    <p style="margin:0 0 0.5rem;font-weight:800;letter-spacing:0.04em;color:var(--amber);">
                        {{ str_repeat('★', (int) $review->rating) }}{{ str_repeat('☆', max(0, 5 - (int) $review->rating)) }}
                    </p>
                    <p style="margin:0 0 0.75rem;line-height:1.5;color:var(--ink);">“{{ \Illuminate\Support\Str::limit($review->comment, 160) }}”</p>
                    <p style="margin:0;font-size:0.85rem;color:var(--muted);">
                        — {{ $review->is_anonymous ? 'Guest' : ($review->customer?->name ?: 'Guest') }}
                        @if($review->item?->name)
                            · {{ $review->item->name }}
                        @endif
                    </p>
                </div>
            @endforeach
        </div>
    </div>
</section>
@endif
