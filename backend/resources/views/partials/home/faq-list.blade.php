@php
    /** @var array<string, mixed> $blockSettings */
    $faqItems = \App\Domains\Content\Blocks\GenericBlockPresenter::faqItems($blockSettings);
    $faqSectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'section' : 'section alt';
@endphp

@if(count($faqItems) > 0)
    <section class="{{ $faqSectionClass }}" data-home-block="faq_list">
        <div class="section-inner" style="max-width:820px;">
            @foreach($faqItems as $faq)
                <details style="border-bottom:1px solid var(--border); padding:0.9rem 0;">
                    <summary style="cursor:pointer; font-weight:700; color:var(--dark); list-style:none;">{{ $faq['question'] }}</summary>
                    {{-- Answers are sanitised on write by GenericBlockPresenter. --}}
                    <div class="home-block-body" style="margin-top:0.6rem; font-size:0.95rem; line-height:1.65; color:var(--muted);">{!! $faq['answer'] !!}</div>
                </details>
            @endforeach
        </div>
    </section>
@endif
