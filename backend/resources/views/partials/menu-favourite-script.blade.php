{{-- Toggle talks to the existing customer API. CSRF is required; do not
     except this route. Send X-CSRF-TOKEN (see bootstrap/app.php). --}}
<script nonce="{{ csp_nonce() }}">
(function () {
    var meta = document.querySelector('meta[name="csrf-token"]');
    var token = meta ? meta.getAttribute('content') : '';

    document.querySelectorAll('.menu-fav[data-item]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
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
                btn.classList.toggle('is-on', on);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                btn.setAttribute('aria-label', on ? 'Remove from favourites' : 'Add to favourites');
                var icon = btn.querySelector('.menu-fav-icon');
                if (icon) icon.textContent = on ? '❤️' : '🤍';
            });
        });
    });
})();
</script>
