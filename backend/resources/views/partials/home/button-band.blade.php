@php
    /** @var array<string, mixed> $blockSettings */
    // Sanitised on write by GenericBlockPresenter (allow-list markup only).
    $bbText = (string) ($blockSettings['text'] ?? '');
    $bbHasText = trim(strip_tags($bbText)) !== '';
    $bbLabel1 = trim((string) ($blockSettings['button1_label'] ?? ''));
    $bbUrl1 = \App\Domains\Content\Blocks\GenericBlockPresenter::safeUrl((string) ($blockSettings['button1_url'] ?? ''));
    $bbLabel2 = trim((string) ($blockSettings['button2_label'] ?? ''));
    $bbUrl2 = \App\Domains\Content\Blocks\GenericBlockPresenter::safeUrl((string) ($blockSettings['button2_url'] ?? ''));
    $bbSectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'cta-band' : 'cta-band alt';
@endphp

@if($bbHasText || $bbLabel1 !== '' || $bbLabel2 !== '')
<section class="{{ $bbSectionClass }}" data-home-block="button_band">
    <div class="cta-band-inner">
        @if($bbHasText)
            <p style="margin:0 0 1rem; font-size:1.05rem; line-height:1.6;">{!! $bbText !!}</p>
        @endif
        @if($bbLabel1 !== '' || $bbLabel2 !== '')
            <div class="cta-band-btns">
                @if($bbLabel1 !== '')
                    <a href="{{ $bbUrl1 !== '' ? $bbUrl1 : '/order/' }}" class="btn-primary">{{ $bbLabel1 }}</a>
                @endif
                @if($bbLabel2 !== '')
                    <a href="{{ $bbUrl2 !== '' ? $bbUrl2 : '/order/menu' }}" class="btn-outline">{{ $bbLabel2 }}</a>
                @endif
            </div>
        @endif
    </div>
</section>
@endif
