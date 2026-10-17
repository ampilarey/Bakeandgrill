{{ $w['h1'] }} ({{ $brandName }})

{{ $otpCode }}

Works until {{ $expiresAt->format('g:i a') }} ({{ $expiresMinutes }} minutes), once.
@if ($maskedPhone)
Account: {{ $maskedPhone }}
@endif
Asked for: {{ $requestedAt->format('j M Y, g:i a') }} Malé time

Keep this code to yourself. {{ $brandName }} staff will never ask for it.
Didn't ask for it? Ignore this email: {{ $w['nobody'] }}.

{{ \App\Support\EmailBrand::variables()['websiteUrl'] }}
