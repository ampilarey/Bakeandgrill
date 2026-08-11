{{--
  Complaint CTA — multi-select categories + Send. Zero typing required.
  Expects:
    $ctaLabel (button text)
    $waHref (WhatsApp fallback URL, used after logging)
    $complaintEndpoint (POST URL)
    $complaintCategories (list of ['value'=>,'label'=>])
    $complaintItems (optional list of ['id'=>,'name'=>])
    $complaintWindowClosed (optional string message when closed)
    $existingComplaints (list of public summaries for this document)
    $atOpenCap (bool)
    $canSubmitAnother (bool)
    $preselectCategory (optional)
--}}
@php
    $complaintEndpoint = $complaintEndpoint ?? null;
    $complaintCategories = $complaintCategories ?? [];
    $complaintItems = $complaintItems ?? [];
    $complaintWindowClosed = $complaintWindowClosed ?? null;
    $existingComplaints = $existingComplaints ?? [];
    $atOpenCap = (bool) ($atOpenCap ?? false);
    $canSubmitAnother = (bool) ($canSubmitAnother ?? true);
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
    data-at-cap="{{ $atOpenCap ? '1' : '0' }}"
    data-can-another="{{ $canSubmitAnother ? '1' : '0' }}"
>
    @if (count($existingComplaints) > 0)
        <div class="doc-complaint-list" data-complaint-list>
            <p class="doc-complaint-list__title">Your reports for this order</p>
            <ul class="doc-complaint-list__items">
                @foreach ($existingComplaints as $ec)
                    <li class="doc-complaint-list__item">
                        <div class="doc-complaint-list__ref">{{ $ec['reference_number'] ?? '' }}</div>
                        <div class="doc-complaint-list__cats">{{ implode(' · ', $ec['category_labels'] ?? []) }}</div>
                        <div class="doc-complaint-list__meta">
                            <span>{{ $ec['status'] ?? '' }}</span>
                            @if (!empty($ec['created_at']))
                                <span>· {{ \Illuminate\Support\Carbon::parse($ec['created_at'])->timezone(config('app.timezone'))->format('j M, g:ia') }}</span>
                            @endif
                        </div>
                        @if (!empty($ec['customer_reply']))
                            <p class="doc-complaint-list__reply">{{ $ec['customer_reply'] }}</p>
                        @endif
                    </li>
                @endforeach
            </ul>
        </div>
    @endif

    @if ($atOpenCap)
        <p class="doc-complaint-window">
            This order already has open reports. We’ll keep working on them — or continue on WhatsApp.
        </p>
        <a class="doc-btn doc-mistake-cta__btn" href="{{ $waHref }}" target="_blank" rel="noopener">
            Continue on WhatsApp
        </a>
    @else
        <button type="button" class="doc-btn doc-mistake-cta__btn" data-complaint-open>
            {{ $ctaLabel }}
        </button>
        <p class="doc-mistake-cta__hint">Tap what’s wrong (you can pick more than one), then Send.</p>

        <div class="doc-complaint-panel" data-complaint-panel hidden>
            @if ($complaintWindowClosed)
                <p class="doc-complaint-window" data-complaint-window>{{ $complaintWindowClosed }}</p>
            @else
                <p class="doc-complaint-lead">What went wrong? <span class="doc-complaint-lead__hint">Select all that apply</span></p>
                <div class="doc-complaint-cats" role="group" aria-label="Complaint categories">
                    @foreach ($complaintCategories as $cat)
                        <button
                            type="button"
                            class="doc-complaint-cat{{ ($preselectCategory ?? '') === $cat['value'] ? ' is-selected' : '' }}"
                            data-complaint-cat="{{ $cat['value'] }}"
                            @if (($preselectCategory ?? '') === $cat['value']) aria-pressed="true" @else aria-pressed="false" @endif
                        >{{ $cat['label'] }}</button>
                    @endforeach
                </div>
                <p class="doc-complaint-hint" data-complaint-cat-count hidden></p>

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
    @endif

    <div class="doc-complaint-done" data-complaint-done hidden>
        <p class="doc-complaint-confirm" data-complaint-confirm></p>
        <p class="doc-complaint-ref" data-complaint-ref></p>
        <div class="doc-complaint-list" data-complaint-list-after hidden></div>
        <a class="doc-btn doc-mistake-cta__btn" data-complaint-wa href="{{ $waHref }}" target="_blank" rel="noopener">
            Continue on WhatsApp
        </a>
        <button type="button" class="doc-complaint-another" data-complaint-another hidden>
            Report something else with this order
        </button>
    </div>
</div>

@once
@push('scripts')
<script nonce="{{ csp_nonce() }}">
(function () {
    function uid() {
        return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
    var MAX_CATS = 4;

    document.querySelectorAll('[data-complaint-root]').forEach(function (root) {
        var openBtn = root.querySelector('[data-complaint-open]');
        var panel = root.querySelector('[data-complaint-panel]');
        var done = root.querySelector('[data-complaint-done]');
        var sendBtn = root.querySelector('[data-complaint-send]');
        var errEl = root.querySelector('[data-complaint-error]');
        var countEl = root.querySelector('[data-complaint-cat-count]');
        var anotherBtn = root.querySelector('[data-complaint-another]');
        var listAfter = root.querySelector('[data-complaint-list-after]');
        var endpoint = root.getAttribute('data-endpoint');
        var photoEndpoint = root.getAttribute('data-photo-endpoint');
        var selected = [];
        var sending = false;
        var idem = uid();

        function paintCategories() {
            root.querySelectorAll('[data-complaint-cat]').forEach(function (b) {
                var v = b.getAttribute('data-complaint-cat');
                var on = selected.indexOf(v) !== -1;
                b.classList.toggle('is-selected', on);
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            if (sendBtn) sendBtn.disabled = selected.length === 0;
            if (countEl) {
                if (selected.length === 0) {
                    countEl.hidden = true;
                    countEl.textContent = '';
                } else {
                    countEl.hidden = false;
                    countEl.textContent = selected.length + ' selected' + (selected.length >= MAX_CATS ? ' (maximum)' : '');
                }
            }
        }

        function toggleCategory(value) {
            if (!value) return;
            var idx = selected.indexOf(value);
            if (idx !== -1) {
                selected.splice(idx, 1);
            } else if (selected.length < MAX_CATS) {
                selected.push(value);
            }
            paintCategories();
        }

        // Allow star-rating UI (or other callers) to open with a preselected category.
        root.openComplaint = function (category) {
            if (panel) panel.hidden = false;
            if (category && selected.indexOf(category) === -1 && selected.length < MAX_CATS) {
                selected.push(category);
                paintCategories();
            }
            try { panel && panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
        };

        if (openBtn && panel) {
            openBtn.addEventListener('click', function () {
                panel.hidden = !panel.hidden;
            });
        }

        root.querySelectorAll('[data-complaint-cat]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                toggleCategory(btn.getAttribute('data-complaint-cat'));
            });
        });

        // Preselected category (e.g. from low star rating)
        var pre = root.querySelector('[data-complaint-cat].is-selected');
        if (pre) {
            var pv = pre.getAttribute('data-complaint-cat');
            if (pv && selected.indexOf(pv) === -1) selected.push(pv);
            paintCategories();
            if (panel) panel.hidden = false;
        }

        if (anotherBtn) {
            anotherBtn.addEventListener('click', function () {
                if (done) done.hidden = true;
                if (panel) panel.hidden = false;
                if (openBtn) openBtn.hidden = false;
                var hint = root.querySelector('.doc-mistake-cta__hint');
                if (hint) hint.hidden = false;
                selected = [];
                paintCategories();
                idem = uid();
                sending = false;
            });
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
            var xsrf = readCookie('XSRF-TOKEN');
            if (xsrf) {
                try { headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrf); } catch (e) {
                    headers['X-XSRF-TOKEN'] = xsrf;
                }
            }
            return headers;
        }

        function renderList(items) {
            if (!listAfter) return;
            if (!items || !items.length) {
                listAfter.hidden = true;
                listAfter.innerHTML = '';
                return;
            }
            var html = '<p class="doc-complaint-list__title">Your reports for this order</p><ul class="doc-complaint-list__items">';
            items.forEach(function (ec) {
                var cats = (ec.category_labels || []).join(' · ');
                var reply = ec.customer_reply
                    ? '<p class="doc-complaint-list__reply">' + String(ec.customer_reply).replace(/</g, '&lt;') + '</p>'
                    : '';
                html += '<li class="doc-complaint-list__item">'
                    + '<div class="doc-complaint-list__ref">' + (ec.reference_number || '') + '</div>'
                    + '<div class="doc-complaint-list__cats">' + cats + '</div>'
                    + '<div class="doc-complaint-list__meta"><span>' + (ec.status || '') + '</span></div>'
                    + reply
                    + '</li>';
            });
            html += '</ul>';
            listAfter.innerHTML = html;
            listAfter.hidden = false;
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
                return null;
            });
        }

        sendBtn.addEventListener('click', function () {
            if (!selected.length || sending) return;
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
                    categories: selected.slice(),
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
                    if (result.data && result.data.existing_complaints) {
                        renderList(result.data.existing_complaints);
                    }
                    sending = false;
                    sendBtn.disabled = selected.length === 0;
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
                    renderList(result.data.existing_complaints || []);
                    if (anotherBtn) {
                        anotherBtn.hidden = !result.data.can_submit_another;
                    }
                }
                idem = uid();
            }).catch(function () {
                if (errEl) {
                    errEl.hidden = false;
                    errEl.textContent = 'Could not send. Please try again.';
                }
                sending = false;
                sendBtn.disabled = selected.length === 0;
            });
        });
    });
})();
</script>
@endpush
@endonce
