{{ $w['h1'] }} ({{ $brandName }})

{{ $otpCode }}

{{ __('Works until :time (:minutes minutes), once.', ['time' => $expiresAt->format('g:i a'), 'minutes' => $expiresMinutes]) }}
@if ($maskedPhone)
{{ __('Account') }}: {{ $maskedPhone }}
@endif
{{ __('Asked for') }}: {{ $requestedAt->format('j M Y, g:i a') }} {{ __('Malé time') }}

{{ __('Keep this code to yourself.') }} {{ __(':brand staff will never ask for it.', ['brand' => $brandName]) }}
{!! __('Didn\'t ask for it? Ignore this email: :nobody.', ['nobody' => $w['nobody']]) !!}

{{ \App\Support\EmailBrand::variables()['websiteUrl'] }}
