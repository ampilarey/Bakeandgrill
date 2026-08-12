@php
    $annEnabled = content('announcement_enabled', 'false') === 'true';
    $annText = trim(content('announcement_text', ''));
    $annUrl = safe_public_url((string) content('announcement_url', '')) ?? '';
    $annStyle = content('announcement_style', 'info');
@endphp
@if($annEnabled && $annText !== '')
<div class="site-announcement site-announcement--{{ e($annStyle) }}" data-home-block="announcement" role="status" style="margin:0;">
    @if($annUrl !== '')
        <a href="{{ e($annUrl) }}" class="site-announcement__inner">
            <span class="site-announcement__text">{{ $annText }}</span>
            <span class="site-announcement__arrow">→</span>
        </a>
    @else
        <div class="site-announcement__inner">
            <span class="site-announcement__text">{{ $annText }}</span>
        </div>
    @endif
</div>
@endif
