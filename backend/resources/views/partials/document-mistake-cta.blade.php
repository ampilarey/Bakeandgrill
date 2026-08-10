{{--
  Complaint CTA — two taps (category + Send), zero typing required.
  Expects:
    $ctaLabel (button text)
    $waHref (WhatsApp fallback URL, used after logging)
    $complaintEndpoint (POST URL)
    $complaintCategories (list of ['value'=>,'label'=>])
    $complaintItems (optional list of ['id'=>,'name'=>])
    $complaintWindowClosed (optional string message when closed)
    $preselectCategory (optional)
--}}
@php
    $complaintEndpoint = $complaintEndpoint ?? null;
    $complaintCategories = $complaintCategories ?? [];
    $complaintItems = $complaintItems ?? [];
    $complaintWindowClosed = $complaintWindowClosed ?? null;
    $preselectCategory = $preselectCategory ?? null;
    $formId = 'complaint-form-'.substr(sha1(($complaintEndpoint ?? '').$ctaLabel), 0, 8);
@endphp

<div class="doc-mistake-cta" data-complaint-root data-endpoint="{{ $complaintEndpoint }}" data-wa-fallback="{{ $waHref }}">
    <button type="button" class="doc-btn doc-mistake-cta__btn" data-complaint-open>
        {{ $ctaLabel }}
    </button>
    <p class="doc-mistake-cta__hint">Takes two taps. No typing required.</p>

    <div class="doc-complaint-panel" data-complaint-panel hidden>
        @if ($complaintWindowClosed)
            <p class="doc-complaint-window" data-complaint-window>{{ $complaintWindowClosed }}</p>
        @else
            <p class="doc-complaint-lead">What went wrong?</p>
            <div class="doc-complaint-cats" role="group" aria-label="Complaint category">
                @foreach ($complaintCategories as $cat)
                    <button
                        type="button"
                        class="doc-complaint-cat{{ ($preselectCategory ?? '') === $cat['value'] ? ' is-selected' : '' }}"
                        data-complaint-cat="{{ $cat['value'] }}"
                        @if (($preselectCategory ?? '') === $cat['value']) aria-pressed="true" @else aria-pressed="false" @endif
                    >{{ $cat['label'] }}</button>
                @endforeach
            </div>

            @if (count($complaintItems) > 0)
                <details class="doc-complaint-optional">
                    <summary>Which item(s)? (optional)</summary>
                    <div class="doc-complaint-items">
                        @foreach ($complaintItems as $item)
                            <label class="doc-complaint-item">
                                <input type="checkbox" data-complaint-item value="{{ $item['id'] }}">
                                <span>{{ $item['name'] }}</span>
                            </label>
                        @endforeach
                    </div>
                </details>
            @endif

            <details class="doc-complaint-optional" data-complaint-photo-wrap>
                <summary>Add a photo (optional)</summary>
                <input type="file" accept="image/*" capture="environment" data-complaint-photo>
                <p class="doc-complaint-hint">Photos are private. Your complaint still sends if the upload fails.</p>
            </details>

            <details class="doc-complaint-optional">
                <summary>Add a comment (optional)</summary>
                <textarea data-complaint-comment rows="3" maxlength="2000" placeholder="Anything else we should know"></textarea>
            </details>

            <button type="button" class="doc-btn doc-btn-primary doc-complaint-send" data-complaint-send disabled>
                Send
            </button>
            <p class="doc-complaint-error" data-complaint-error hidden></p>
        @endif
    </div>

    <div class="doc-complaint-done" data-complaint-done hidden>
        <p class="doc-complaint-confirm" data-complaint-confirm></p>
        <p class="doc-complaint-ref" data-complaint-ref></p>
        <a class="doc-btn doc-mistake-cta__btn" data-complaint-wa href="{{ $waHref }}" target="_blank" rel="noopener">
            Continue on WhatsApp
        </a>
    </div>
</div>

@once
@push('scripts')
<script nonce="{{ csp_nonce() }}">
(function () {
    function uid() {
        return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
    document.querySelectorAll('[data-complaint-root]').forEach(function (root) {
        var openBtn = root.querySelector('[data-complaint-open]');
        var panel = root.querySelector('[data-complaint-panel]');
        var done = root.querySelector('[data-complaint-done]');
        var sendBtn = root.querySelector('[data-complaint-send]');
        var errEl = root.querySelector('[data-complaint-error]');
        var endpoint = root.getAttribute('data-endpoint');
        var selected = null;
        var sending = false;
        var idem = uid();

        if (openBtn && panel) {
            openBtn.addEventListener('click', function () {
                panel.hidden = !panel.hidden;
            });
        }

        root.querySelectorAll('[data-complaint-cat]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                root.querySelectorAll('[data-complaint-cat]').forEach(function (b) {
                    b.classList.remove('is-selected');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('is-selected');
                btn.setAttribute('aria-pressed', 'true');
                selected = btn.getAttribute('data-complaint-cat');
                if (sendBtn) sendBtn.disabled = !selected;
            });
        });

        // Preselected category (e.g. from low star rating)
        var pre = root.querySelector('[data-complaint-cat].is-selected');
        if (pre) {
            selected = pre.getAttribute('data-complaint-cat');
            if (sendBtn) sendBtn.disabled = !selected;
            if (panel) panel.hidden = false;
        }

        if (!sendBtn || !endpoint) return;

        sendBtn.addEventListener('click', function () {
            if (!selected || sending) return;
            sending = true;
            sendBtn.disabled = true;
            if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

            var itemIds = [];
            root.querySelectorAll('[data-complaint-item]:checked').forEach(function (cb) {
                itemIds.push(parseInt(cb.value, 10));
            });
            var commentEl = root.querySelector('[data-complaint-comment]');
            var comment = commentEl ? (commentEl.value || '').trim() : '';

            var body = {
                category: selected,
                order_item_ids: itemIds,
                comment: comment || null,
                idempotency_key: idem
            };

            var csrf = document.querySelector('meta[name="csrf-token"]');
            fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(csrf ? { 'X-CSRF-TOKEN': csrf.getAttribute('content') } : {})
                },
                body: JSON.stringify(body),
                credentials: 'same-origin'
            }).then(function (res) {
                return res.json().then(function (data) {
                    return { ok: res.ok, status: res.status, data: data };
                });
            }).then(function (result) {
                if (!result.ok) {
                    if (errEl) {
                        errEl.hidden = false;
                        errEl.textContent = (result.data && result.data.message) || 'Could not send. Please try again.';
                    }
                    sending = false;
                    sendBtn.disabled = !selected;
                    return;
                }
                if (panel) panel.hidden = true;
                if (openBtn) openBtn.hidden = true;
                var hint = root.querySelector('.doc-mistake-cta__hint');
                if (hint) hint.hidden = true;
                if (done) {
                    done.hidden = false;
                    var conf = done.querySelector('[data-complaint-confirm]');
                    var ref = done.querySelector('[data-complaint-ref]');
                    var wa = done.querySelector('[data-complaint-wa]');
                    if (conf) conf.textContent = result.data.confirmation || 'Recorded.';
                    if (ref) ref.textContent = 'Reference ' + (result.data.complaint && result.data.complaint.reference_number ? result.data.complaint.reference_number : '');
                    if (wa && result.data.whatsapp_href) wa.href = result.data.whatsapp_href;
                }
            }).catch(function () {
                if (errEl) {
                    errEl.hidden = false;
                    errEl.textContent = 'Could not send. Please try again.';
                }
                sending = false;
                sendBtn.disabled = !selected;
            });
        });
    });
})();
</script>
@endpush
@endonce
