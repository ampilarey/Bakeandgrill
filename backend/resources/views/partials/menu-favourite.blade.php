{{--
    Heart sits beside the stretched card link, never inside it — a button
    inside an <a> is invalid HTML. Signed-in state comes from the server so
    the first paint is already filled or empty. Guests keep the heart; it
    is a login link, not a hidden control and not a 401 in the console.
--}}
@php
    $liked = isset($favouriteIds[$item->id]);
@endphp
@auth('customer')
    <button type="button"
            class="menu-fav{{ $liked ? ' is-on' : '' }}"
            data-item="{{ $item->id }}"
            aria-pressed="{{ $liked ? 'true' : 'false' }}"
            aria-label="{{ $liked ? 'Remove from favourites' : 'Add to favourites' }}">
        <span class="menu-fav-icon" aria-hidden="true">{{ $liked ? '❤️' : '🤍' }}</span>
    </button>
@else
    <a class="menu-fav" href="/customer/login" aria-label="Sign in to save favourites">
        <span class="menu-fav-icon" aria-hidden="true">🤍</span>
    </a>
@endauth
