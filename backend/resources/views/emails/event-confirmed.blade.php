@extends('emails.layout')

@section('title', 'Event confirmed ' . $request->reference)
@section('preheader', 'Your event ' . $request->reference . ' is confirmed for ' . $when . '.')
@section('band', 'Event confirmed')

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">Your event is confirmed</h1>
    <p style="margin:0 0 22px; color:#6B5D4F;">Hi {{ $request->contact_name ?: 'there' }}, everything is booked. Here are the details to keep.</p>

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        ['Reference', $request->reference],
        ['When', $when],
        $venue ? ['Where', $venue] : null,
        ['Paid', 'MVR ' . $paidMvr],
        $hasBalance ? ['Balance due on the day', 'MVR ' . $balanceMvr, true] : null,
    ]))])

    <p style="margin:0; font-size:14px; line-height:22px; color:#6B5D4F;">Something changed? Message us as early as you can and we'll sort it out.</p>
@endsection

@section('footer_note', 'You are receiving this because you booked an event with Bake & Grill.')
