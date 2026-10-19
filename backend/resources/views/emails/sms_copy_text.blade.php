{{ $greetingName ? 'Hi ' . $greetingName . ',' : $heading }}

{{ $body }}

@if (!$smsSent)
Sent by email only.
@elseif ($audience === 'staff')
A copy of the alert texted to {{ $maskedPhone ?? 'your phone' }}.
@else
A copy of the text we sent to {{ $maskedPhone ?? 'your phone' }}.
@endif
@if ($unsubscribeUrl)
Stop offer emails (offer texts too, if you like): {{ $unsubscribeUrl }}
@endif

{{ $brandName }} · {{ \App\Support\EmailBrand::variables()['websiteUrl'] }}
