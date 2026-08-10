@php
    /** @var array<string, mixed> $blockSettings */
    $itImage = \App\Domains\Content\Blocks\GenericBlockPresenter::resolveImage(
        \App\Domains\Content\Blocks\GenericBlockPresenter::mediaId($blockSettings)
    );
    $itHeading = trim((string) ($blockSettings['heading'] ?? ''));
    $itBody = (string) ($blockSettings['body'] ?? '');
    $itHasBody = trim(strip_tags($itBody)) !== '';
    $itCaption = trim((string) ($blockSettings['caption'] ?? ''));
    $itAlt = trim((string) ($blockSettings['alt'] ?? '')) ?: (string) ($itImage['alt'] ?? '');
    $itSide = ($blockSettings['side'] ?? 'left') === 'right' ? 'right' : 'left';
    $itSectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'section' : 'section alt';
    // A block whose only content was a picture that has since been deleted
    // has nothing left to render.
    $itRenders = $itImage !== null || $itHeading !== '' || $itHasBody;
@endphp

@if($itRenders)
<section class="{{ $itSectionClass }}" data-home-block="image_text" data-side="{{ $itSide }}">
    <div class="section-inner" style="max-width:1000px;">
        <div style="display:flex; flex-wrap:wrap; gap:1.75rem; align-items:center; {{ $itSide === 'right' ? 'flex-direction:row-reverse;' : '' }}">
            {{-- Missing media does not swallow the words next to it. --}}
            @if($itImage !== null)
                <figure style="margin:0; flex:1 1 280px; min-width:min(100%, 280px);">
                    <picture>
                        @if(!empty($itImage['webp']))
                            <source type="image/webp" srcset="{{ $itImage['webp'] }}">
                        @endif
                        <img
                            src="{{ $itImage['url'] }}"
                            alt="{{ $itAlt }}"
                            loading="lazy"
                            decoding="async"
                            style="display:block; width:100%; height:auto; border-radius:14px;"
                        >
                    </picture>
                    @if($itCaption !== '')
                        <figcaption style="margin-top:0.5rem; font-size:0.85rem; color:var(--muted);">{{ $itCaption }}</figcaption>
                    @endif
                </figure>
            @endif
            @if($itHeading !== '' || $itHasBody)
                <div style="flex:1 1 320px; min-width:min(100%, 280px);">
                    @if($itHeading !== '')
                        <h2 class="section-title" style="text-align:left; margin-top:0;">{{ $itHeading }}</h2>
                    @endif
                    @if($itHasBody)
                        {{-- Sanitised on write by GenericBlockPresenter. --}}
                        <div class="home-block-body" style="font-size:1rem; line-height:1.7; color:var(--muted);">{!! $itBody !!}</div>
                    @endif
                </div>
            @endif
        </div>
    </div>
</section>
@endif
