{{--
  Shared WhatsApp mistake-report CTA for invoice / receipt / order-track.
  Expects: $waHref (full wa.me URL with text=), $ctaLabel (button text)
--}}
<div class="doc-mistake-cta">
    <a class="doc-btn doc-mistake-cta__btn" href="{{ $waHref }}" target="_blank" rel="noopener">
        {{ $ctaLabel }}
    </a>
    <p class="doc-mistake-cta__hint">Message us on WhatsApp and we’ll fix it.</p>
</div>
