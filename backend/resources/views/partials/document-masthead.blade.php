<div class="doc-masthead">
    <div class="doc-masthead-inner">
        <img src="{{ $brandLogoWeb }}" alt="" width="44" height="44">
        <div class="doc-masthead-text">
            <span class="doc-masthead-name">{{ $brandSiteName }}</span>
            <span class="doc-masthead-tagline">{{ $brandTagline }}</span>
        </div>
    </div>
    <div class="doc-masthead-doc">
        <span class="doc-masthead-type">{{ $docType ?? 'Document' }}</span>
        <span class="doc-masthead-number">{{ $docNumber ?? '' }}</span>
        @if (!empty($docBadge))
            <span class="doc-badge {{ $docBadgeClass ?? 'doc-badge--paid' }}">{{ $docBadge }}</span>
        @endif
    </div>
</div>
