@php
    $sectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'section' : 'section alt';
@endphp

<section class="{{ $sectionClass }}">
    <div class="section-inner">
        <div class="section-header">
            <span class="section-eyebrow">{{ $homeLocationEyebrow }}</span>
            <h2 class="section-title">{{ $homeLocationTitle }}</h2>
            <p class="section-sub">{{ $homeLocationSubtitle }}</p>
        </div>
        <div class="location-grid">
            <div class="loc-card">
                <div class="loc-card-accent"></div>
                <div class="loc-card-icon">📍</div>
                <h3>{{ $homeVisitCardTitle }}</h3>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        {{ $address }}
                        <small>{{ $landmark }}</small>
                    </div>
                </div>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        @if($isOpen)
                            <span style="color:var(--success-text);font-weight:700;">{{ $homeOpenBadgeText }}</span>
                            @if($todayHours) · Closes {{ $todayHours['close'] }} @endif
                        @else
                            <span style="color:var(--danger-text);font-weight:700;">{{ $homeClosedBadgeText }}</span>
                            @if($todayHours) · Opens {{ $todayHours['open'] }} @endif
                        @endif
                        <small><a href="/hours" style="color:var(--amber);">See full schedule →</a></small>
                    </div>
                </div>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        {{ $phone }}
                        <small>Call to reserve or ask about custom orders</small>
                    </div>
                </div>

                <hr class="loc-divider">

                <p class="chat-label">{{ $homeChatLabel ?: 'Chat with us' }}</p>
                <div class="chat-block" data-home-chat>
                    <a href="{{ $waLink }}" target="_blank" rel="noopener" class="chat-btn chat-btn-wa">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        WhatsApp
                    </a>
                    @if($viberLink !== '')
                        <a href="{{ $viberLink }}" class="chat-btn chat-btn-viber">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 0C5.7.3 1.2 4.8.9 10.5c-.2 3.4.8 6.5 2.7 8.9L2.2 24l4.8-1.4c1.4.7 3 1.1 4.7 1.1 6.1 0 11.1-5 11.1-11.1S17.9 0 11.8 0h-.4zm.5 2c5.1 0 9.1 4 9.1 9.1s-4 9.1-9.1 9.1c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .9.9-2.9-.2-.3C3.7 15.2 3.1 13.1 3.1 11 3.1 5.9 7.2 2 12.1 2h-.2zm-.8 3.2c-.3 0-.8.1-1.2.5C9.5 6.3 8.8 7 8.8 8.5s1 3 1.2 3.2c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.1 1.8-.1.5-.3 1.6-1.5 1.8-2.3.2-.7.1-1.3-.1-1.5-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.2c-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.2-.2.4-.4.5-.6.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6-.1-.1-.8-1.9-1.1-2.7-.2-.5-.5-.5-.7-.5z"/></svg>
                            Viber
                        </a>
                    @endif
                </div>

                <div class="loc-ctas" style="margin-top:1rem;">
                    <a href="{{ $mapsUrl }}" target="_blank" rel="noopener" class="loc-cta-outline">
                        📍 {{ $homeDirectionsCta }}
                    </a>
                    <a href="{{ $phoneTel }}" class="loc-cta-outline">
                        📞 {{ $homeCallCta }}
                    </a>
                </div>
            </div>

            <div class="loc-card">
                <div class="loc-card-accent"></div>
                <div class="loc-card-icon">🛵</div>
                <h3>{{ $homeDeliveryCardTitle }}</h3>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        {{ $homeDeliveryTagline }}
                        <small>{{ $homeDeliverySubtitle }}</small>
                    </div>
                </div>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        {{ $deliveryTime }} average delivery time
                        <small>{{ $homeDeliveryQualityLine }}</small>
                    </div>
                </div>

                <div class="loc-detail-row">
                    <div class="loc-detail-dot"></div>
                    <div class="loc-detail-text">
                        Free delivery on orders over {{ $deliveryThreshold }}
                        <small>{{ $homeDeliveryPaymentLine }}</small>
                    </div>
                </div>

                <hr class="loc-divider">

                <div class="loc-ctas" style="margin-top:0;">
                    <a href="/order/" class="loc-cta-primary">
                        🛒 Order Online Now
                    </a>
                    <a href="/order/menu" class="loc-cta-outline">
                        🍽️ View Menu
                    </a>
                </div>
            </div>
        </div>
    </div>
</section>
