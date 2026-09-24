{{--
    Native share sheet on a user click; otherwise a popover with Copy link
    (Clipboard API, then a select-and-copy field) and encoded intent URLs.
    No share counting in this phase.
--}}
@php
    $shareUrl = $shareUrl ?? url()->current();
    $shareTitle = $shareTitle ?? 'Bake & Grill';
    $shareText = $shareText ?? $shareTitle;
    $shareEncodedUrl = rawurlencode($shareUrl);
    $shareEncodedText = rawurlencode($shareText);
    $shareId = $shareId ?? 'share-'.substr(sha1($shareUrl), 0, 8);
    // Which item or category this is (owner, 2026-09-24): a share is reported
    // to /api/share-events so the Social Hub can show what customers pass on.
    $shareItemId = isset($shareItemId) && is_numeric($shareItemId) ? (int) $shareItemId : null;
    $shareCategoryId = isset($shareCategoryId) && is_numeric($shareCategoryId) ? (int) $shareCategoryId : null;
@endphp
<div class="share-control" data-share-root>
    <button type="button"
            class="share-control-btn {{ $shareButtonClass ?? 'btn-outline' }}"
            data-share-open
            aria-haspopup="dialog"
            aria-expanded="false"
            aria-controls="{{ $shareId }}-popover"
            @if(!empty($shareLabel)) aria-label="{{ $shareLabel }}" @endif
            data-testid="share-open">
        Share
    </button>
    <div id="{{ $shareId }}-popover"
         class="share-popover"
         role="dialog"
         aria-label="Share this page"
         hidden
         data-share-popover
         data-share-url="{{ $shareUrl }}"
         data-share-title="{{ $shareTitle }}"
         data-share-text="{{ $shareText }}"
         @if($shareItemId) data-share-item="{{ $shareItemId }}" @endif
         @if($shareCategoryId) data-share-category="{{ $shareCategoryId }}" @endif>
        <button type="button" class="share-copy" data-share-copy data-testid="share-copy">Copy link</button>
        <label class="share-fallback-label" hidden data-share-fallback-wrap>
            Link
            <input class="share-fallback-input" type="text" readonly value="{{ $shareUrl }}" data-share-fallback data-testid="share-fallback-input">
        </label>
        <p class="share-copy-status" data-share-status hidden></p>
        <ul class="share-intents">
            <li><a href="https://wa.me/?text={{ $shareEncodedText }}%20{{ $shareEncodedUrl }}" rel="noopener noreferrer" target="_blank" data-share-channel="whatsapp">WhatsApp</a></li>
            <li><a href="https://t.me/share/url?url={{ $shareEncodedUrl }}&amp;text={{ $shareEncodedText }}" rel="noopener noreferrer" target="_blank" data-share-channel="telegram">Telegram</a></li>
            <li><a href="viber://forward?text={{ $shareEncodedText }}%20{{ $shareEncodedUrl }}" data-share-channel="viber">Viber</a></li>
            <li><a href="https://www.facebook.com/sharer/sharer.php?u={{ $shareEncodedUrl }}" rel="noopener noreferrer" target="_blank" data-share-channel="facebook">Facebook</a></li>
            <li><a href="https://twitter.com/intent/tweet?url={{ $shareEncodedUrl }}&amp;text={{ $shareEncodedText }}" rel="noopener noreferrer" target="_blank" data-share-channel="x">X</a></li>
        </ul>
        <button type="button" class="share-close" data-share-close>Close</button>
    </div>
</div>
{{-- One copy of the styles and script however many controls a page has. --}}
@once
<style>
.share-control { position: relative; display: inline-flex; }
.share-popover {
    position: absolute; z-index: var(--z-modal, 50); bottom: calc(100% + 0.4rem); left: 0;
    min-width: 16rem; padding: 0.85rem;
    background: #fff; border: 1px solid var(--border); border-radius: 12px;
    box-shadow: 0 10px 30px rgba(28,20,8,0.14);
}
.share-copy, .share-close {
    display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: center;
    margin: 0; border: 1px solid var(--border); border-radius: 10px;
    background: var(--bg); font: inherit; font-weight: 700; cursor: pointer;
}
.share-close { margin-top: 0.5rem; font-weight: 600; }
.share-intents { list-style: none; margin: 0.65rem 0 0; padding: 0; display: grid; gap: 0.35rem; }
.share-intents a {
    display: flex; min-height: 44px; align-items: center; padding: 0 0.75rem;
    color: var(--dark); text-decoration: none; border-radius: 8px;
}
.share-intents a:hover, .share-intents a:focus-visible { background: var(--amber-light); }
.share-fallback-label { display: block; margin-top: 0.5rem; font-size: 0.8rem; color: var(--muted); }
.share-fallback-input { width: 100%; min-height: 44px; margin-top: 0.25rem; padding: 0 0.6rem; }
.share-copy-status { margin: 0.4rem 0 0; font-size: 0.8rem; color: var(--muted); }
</style>
<script nonce="{{ csp_nonce() }}">
(function () {
    // Exposed and re-runnable because the menu opens an item in a sheet, so a
    // share control can arrive long after this script first ran. The per-root
    // `data-share-bound` guard below already makes a second pass harmless, so
    // the sheet just calls this again once its markup is in the page.
    window.__shareInit = function () {
    document.querySelectorAll('[data-share-root]').forEach(function (root) {
        if (root.getAttribute('data-share-bound') === '1') return;
        root.setAttribute('data-share-bound', '1');
        var openBtn = root.querySelector('[data-share-open]');
        var pop = root.querySelector('[data-share-popover]');
        var copyBtn = root.querySelector('[data-share-copy]');
        var closeBtn = root.querySelector('[data-share-close]');
        var fallbackWrap = root.querySelector('[data-share-fallback-wrap]');
        var fallbackInput = root.querySelector('[data-share-fallback]');
        var status = root.querySelector('[data-share-status]');
        if (!openBtn || !pop) return;

        // Tell the Social Hub what was shared (no personal data; fire and forget).
        function report(channel) {
            var itemId = pop.getAttribute('data-share-item');
            var categoryId = pop.getAttribute('data-share-category');
            if (!itemId && !categoryId) return;
            try {
                fetch('/api/share-events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ item_id: itemId ? Number(itemId) : null, category_id: categoryId ? Number(categoryId) : null, channel: channel, surface: 'web' }),
                    keepalive: true,
                    credentials: 'same-origin'
                }).catch(function () {});
            } catch (e) { /* counting never breaks sharing */ }
        }
        pop.querySelectorAll('[data-share-channel]').forEach(function (a) {
            a.addEventListener('click', function () { report(a.getAttribute('data-share-channel')); });
        });

        function focusables() {
            return Array.prototype.slice.call(pop.querySelectorAll('button, a, input')).filter(function (el) {
                return !el.hidden && el.offsetParent !== null;
            });
        }
        function setOpen(on) {
            pop.hidden = !on;
            openBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
            if (on) {
                var first = focusables()[0];
                if (first) first.focus();
            } else {
                openBtn.focus();
            }
        }
        openBtn.addEventListener('click', function () {
            var url = pop.getAttribute('data-share-url') || '';
            var title = pop.getAttribute('data-share-title') || '';
            var text = pop.getAttribute('data-share-text') || title;
            if (navigator.share) {
                navigator.share({ title: title, text: text, url: url }).then(function () { report('native'); }).catch(function () {});
                return;
            }
            setOpen(pop.hidden);
        });
        if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });
        if (copyBtn) copyBtn.addEventListener('click', function () {
            var url = pop.getAttribute('data-share-url') || '';
            function showFallback() {
                if (fallbackWrap) fallbackWrap.hidden = false;
                if (fallbackInput) {
                    fallbackInput.focus();
                    fallbackInput.select();
                }
                if (status) {
                    status.hidden = false;
                    status.textContent = 'Select and copy the link';
                }
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(function () {
                    if (status) {
                        status.hidden = false;
                        status.textContent = 'Link copied';
                    }
                    report('copy');
                }).catch(showFallback);
            } else {
                showFallback();
            }
        });
        pop.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                return;
            }
            if (e.key !== 'Tab') return;
            var items = focusables();
            if (!items.length) return;
            var first = items[0];
            var last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
        document.addEventListener('click', function (e) {
            if (pop.hidden) return;
            if (!root.contains(e.target)) setOpen(false);
        });
    });
    };

    window.__shareInit();
})();
</script>
@endonce
