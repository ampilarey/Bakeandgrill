{{-- Expandable prayer banner — matches order-app PrayerBar UI --}}
<section class="prayer-banner is-loading" data-pt-banner aria-label="Prayer times">
    <div class="prayer-banner-skeleton" data-pt-skeleton aria-hidden="true">
        <span class="prayer-banner-skeleton-bar"></span>
    </div>
    <div class="prayer-banner-unavailable" data-pt-unavailable hidden>
        <span>Prayer times unavailable</span>
    </div>
    <div class="prayer-banner-body" data-pt-body hidden>
        <div class="prayer-banner-summary">
            <button type="button" class="prayer-banner-expand" data-pt-expand aria-expanded="false">
                <span class="prayer-banner-summary-left">
                    <span class="prayer-banner-next">
                        <strong data-pt-name></strong>
                        <span class="prayer-banner-time" data-pt-time></span>
                        <span class="prayer-banner-cd" data-pt-cd aria-live="off"></span>
                    </span>
                </span>
                <span class="prayer-banner-chevron" data-pt-chevron aria-hidden="true">▾</span>
            </button>
            <button type="button" class="prayer-banner-island" data-pt-island>
                <span data-pt-loc>K. Malé</span> ▾
            </button>
        </div>
        <div class="prayer-banner-panel" data-pt-panel hidden>
            <div class="prayer-banner-grid" data-pt-grid role="list"></div>
            <div class="prayer-banner-actions">
                <button type="button" class="prayer-banner-action" data-pt-geo>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                        <circle cx="12" cy="12" r="8" opacity=".18"/>
                    </svg>
                    Use my location
                </button>
                <button type="button" class="prayer-banner-action" data-pt-change-island>
                    Change island
                </button>
            </div>
        </div>
    </div>
</section>
