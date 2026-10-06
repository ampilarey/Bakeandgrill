{{ $greetingName ? 'Hi ' . $greetingName . ',' : $heading }}

{{ $body }}

@if ($audience === 'staff')
A copy of the alert texted to {{ $maskedPhone ?? 'your phone' }}.
@else
A copy of the text we sent to {{ $maskedPhone ?? 'your phone' }}.
@endif
@if ($unsubscribeUrl)
Stop promotional messages (SMS and email): {{ $unsubscribeUrl }}
@endif

{{ $brandName }} · {{ \App\Support\EmailBrand::variables()['websiteUrl'] }}
