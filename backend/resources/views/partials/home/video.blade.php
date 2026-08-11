@php
    /** @var array<string, mixed> $blockSettings */
    $vidData = \App\Domains\Content\Blocks\GenericBlockPresenter::resolveVideo(
        \App\Domains\Content\Blocks\GenericBlockPresenter::mediaId($blockSettings)
    );
    $vidCaption = trim((string) ($blockSettings['caption'] ?? ''));
    $vidSectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'section' : 'section alt';
@endphp

{{-- Deleted media (or a non-video asset) renders nothing at all. --}}
@if($vidData !== null)
    <section class="{{ $vidSectionClass }}" data-home-block="video">
        <div class="section-inner" style="max-width:900px;">
            <figure style="margin:0;">
                {{-- Same silent-loop treatment as the hero video. --}}
                <video
                    src="{{ $vidData['url'] }}"
                    @if($vidData['poster_url']) poster="{{ $vidData['poster_url'] }}" @endif
                    autoplay
                    muted
                    loop
                    playsinline
                    preload="metadata"
                    aria-label="{{ $vidData['alt'] !== '' ? $vidData['alt'] : ($vidCaption !== '' ? $vidCaption : 'Video') }}"
                    style="display:block; width:100%; height:auto; border-radius:14px; background:#000;"
                ></video>
                @if($vidCaption !== '')
                    <figcaption style="margin-top:0.6rem; font-size:0.875rem; color:var(--muted); text-align:center;">{{ $vidCaption }}</figcaption>
                @endif
            </figure>
        </div>
    </section>
@endif
