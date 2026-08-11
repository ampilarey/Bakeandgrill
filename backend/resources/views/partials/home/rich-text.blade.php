@php
    /** @var array<string, mixed> $blockSettings */
    $rtHeading = trim((string) ($blockSettings['heading'] ?? ''));
    // Body is stored already sanitised by GenericBlockPresenter (allow-list of
    // markup only) — that is why it may be printed unescaped below.
    $rtBody = (string) ($blockSettings['body'] ?? '');
    $rtHasBody = trim(strip_tags($rtBody)) !== '';
    $rtSectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'section' : 'section alt';
@endphp

<section class="{{ $rtSectionClass }}" data-home-block="rich_text">
    <div class="section-inner" style="max-width:760px;">
        @if($rtHeading !== '')
            <h2 class="section-title" style="text-align:left;">{{ $rtHeading }}</h2>
        @endif
        @if($rtHasBody)
            <div class="home-block-body" style="font-size:1rem; line-height:1.7; color:var(--muted);">{!! $rtBody !!}</div>
        @endif
    </div>
</section>
