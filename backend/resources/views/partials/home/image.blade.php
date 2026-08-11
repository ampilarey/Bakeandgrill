@php
    /** @var array<string, mixed> $blockSettings */
    $imgData = \App\Domains\Content\Blocks\GenericBlockPresenter::resolveImage(
        \App\Domains\Content\Blocks\GenericBlockPresenter::mediaId($blockSettings)
    );
    $imgCaption = trim((string) ($blockSettings['caption'] ?? ''));
    $imgAlt = trim((string) ($blockSettings['alt'] ?? '')) ?: (string) ($imgData['alt'] ?? '');
    $imgSectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'section' : 'section alt';
@endphp

{{-- A deleted or replaced media row leaves nothing to show: skip the block
     rather than printing a broken image frame. --}}
@if($imgData !== null)
    <section class="{{ $imgSectionClass }}" data-home-block="image">
        <div class="section-inner" style="max-width:900px;">
            <figure style="margin:0;">
                <picture>
                    @if(!empty($imgData['webp']))
                        <source type="image/webp" srcset="{{ $imgData['webp'] }}">
                    @endif
                    <img
                        src="{{ $imgData['url'] }}"
                        alt="{{ $imgAlt }}"
                        loading="lazy"
                        decoding="async"
                        @if($imgData['width']) width="{{ $imgData['width'] }}" @endif
                        @if($imgData['height']) height="{{ $imgData['height'] }}" @endif
                        style="display:block; width:100%; height:auto; border-radius:14px;"
                    >
                </picture>
                @if($imgCaption !== '')
                    <figcaption style="margin-top:0.6rem; font-size:0.875rem; color:var(--muted); text-align:center;">{{ $imgCaption }}</figcaption>
                @endif
            </figure>
        </div>
    </section>
@endif
