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

@php
    $photoEndpoint = $photoEndpoint ?? (
        is_string($complaintEndpoint)
            ? preg_replace('#/complaints$#', '/complaint-photos', $complaintEndpoint)
            : null
    );
@endphp
<div
    class="doc-mistake-cta"
    data-complaint-root
    data-endpoint="{{ $complaintEndpoint }}"
    data-photo-endpoint="{{ $photoEndpoint }}"
    data-wa-fallback="{{ $waHref }}"
>
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
        var photoEndpoint = root.getAttribute('data-photo-endpoint');
        var selected = null;
        var sending = false;
        var idem = uid();

        function selectCategory(value) {
            if (!value) return;
            root.querySelectorAll('[data-complaint-cat]').forEach(function (b) {
                var on = b.getAttribute('data-complaint-cat') === value;
                b.classList.toggle('is-selected', on);
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            selected = value;
            if (sendBtn) sendBtn.disabled = !selected;
        }

        // Allow star-rating UI (or other callers) to open with a preselected category.
        root.openComplaint = function (category) {
            if (panel) panel.hidden = false;
            if (category) selectCategory(category);
            try { panel && panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
        };

        if (openBtn && panel) {
            openBtn.addEventListener('click', function () {
                panel.hidden = !panel.hidden;
            });
        }

        root.querySelectorAll('[data-complaint-cat]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                selectCategory(btn.getAttribute('data-complaint-cat'));
            });
        });

        // Preselected category (e.g. from low star rating)
        var pre = root.querySelector('[data-complaint-cat].is-selected');
        if (pre) {
            selectCategory(pre.getAttribute('data-complaint-cat'));
            if (panel) panel.hidden = false;
        }

        if (!sendBtn || !endpoint) return;

        function readCookie(name) {
            var parts = (';' + document.cookie).split('; ' + name + '=');
            if (parts.length < 2) return null;
            return parts.pop().split(';').shift() || null;
        }

        function csrfHeaders(extra) {
            var csrf = document.querySelector('meta[name="csrf-token"]');
            var headers = Object.assign({
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }, extra || {});
            if (csrf && csrf.getAttribute('content')) {
                headers['X-CSRF-TOKEN'] = csrf.getAttribute('content');
            }
            // Sanctum/Laravel also accept the encrypted XSRF-TOKEN cookie value.
            var xsrf = readCookie('XSRF-TOKEN');
            if (xsrf) {
                try { headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrf); } catch (e) {
                    headers['X-XSRF-TOKEN'] = xsrf;
                }
            }
            return headers;
        }

        function uploadPhotoIfAny() {
            var input = root.querySelector('[data-complaint-photo]');
            var file = input && input.files && input.files[0] ? input.files[0] : null;
            if (!file || !photoEndpoint) {
                return Promise.resolve(null);
            }
            var fd = new FormData();
            fd.append('photo', file);
            return fetch(photoEndpoint, {
                method: 'POST',
                headers: csrfHeaders(),
                body: fd,
                credentials: 'same-origin'
            }).then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) return null;
                    return (data && data.upload_id) ? data.upload_id : null;
                });
            }).catch(function () {
                // Upload failure must never lose the complaint.
                return null;
            });
        }

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

            uploadPhotoIfAny().then(function (uploadId) {
                var body = {
                    category: selected,
                    order_item_ids: itemIds,
                    comment: comment || null,
                    idempotency_key: idem,
                    photo_upload_id: uploadId
                };

                return fetch(endpoint, {
                    method: 'POST',
                    headers: csrfHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(body),
                    credentials: 'same-origin'
                }).then(function (res) {
                    return res.json().then(function (data) {
                        return { ok: res.ok, status: res.status, data: data };
                    });
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
