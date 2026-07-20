<x-mail::message>
# Event confirmed — {{ $request->reference }}

Hi {{ $request->contact_name ?: 'there' }},

Your event is confirmed.

**When:** {{ $when }}  
**Where:** {{ $venue }}  
**Paid:** MVR {{ $paidMvr }}
@if($hasBalance)
**Balance due on the day:** MVR {{ $balanceMvr }}
@endif

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
