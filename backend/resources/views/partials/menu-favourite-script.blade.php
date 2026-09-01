{{-- Toggle talks to the existing customer API. CSRF is required; do not
     except this route. Send X-CSRF-TOKEN (see bootstrap/app.php).

     Delegated from the document rather than bound to each button at load,
     because the menu now opens an item in a sheet whose markup arrives after
     this script has already run. A per-button listener would leave the heart
     inside the sheet dead. One listener also costs less on a category page
     carrying a hundred cards. --}}
<script nonce="{{ csp_nonce() }}">
(function () {
    if (window.__menuFavBound) return;
    window.__menuFavBound = true;

    document.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.menu-fav[data-item]') : null;
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        // Read the token at click time — a sheet can outlive a token refresh.
        var meta = document.querySelector('meta[name="csrf-token"]');
        var token = meta ? meta.getAttribute('content') : '';
        var id = btn.getAttribute('data-item');

        fetch('/api/customer/favorites/' + id + '/toggle', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': token
            }
        }).then(function (res) {
            if (res.status === 401) {
                window.location = '/customer/login';
                return null;
            }
            return res.json();
        }).then(function (data) {
            if (!data) return;
            var on = !!data.favorited;
            // Every copy of this item's heart — the card behind the sheet and
            // the one inside it — so closing the sheet does not reveal a stale
            // outline on the card the customer just favourited.
            document.querySelectorAll('.menu-fav[data-item="' + id + '"]').forEach(function (el) {
                el.classList.toggle('is-on', on);
                el.setAttribute('aria-pressed', on ? 'true' : 'false');
                el.setAttribute('aria-label', on ? 'Remove from favourites' : 'Add to favourites');
                var icon = el.querySelector('.menu-fav-icon');
                if (icon) icon.textContent = on ? '❤️' : '🤍';
            });
        }).catch(function () { /* offline — the heart just does not move */ });
    });
})();
</script>
