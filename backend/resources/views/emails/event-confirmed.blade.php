@extends('emails.layout')

@section('title', __('Event confirmed :ref', ['ref' => $request->reference]))
@section('preheader', __('Your event :ref is confirmed for :when.', ['ref' => $request->reference, 'when' => $when]))
@section('band', __('Event confirmed'))

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">{{ __('Your event is confirmed') }}</h1>
    <p style="margin:0 0 22px; color:#6B5D4F;">{{ __('Hi :name, everything is booked. Here are the details to keep.', ['name' => $request->contact_name ?: __('there')]) }}</p>

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        [__('Reference'), $request->reference],
        [__('When'), $when],
        $venue ? [__('Where'), $venue] : null,
        [__('Paid'), 'MVR ' . $paidMvr],
        $hasBalance ? [__('Balance due on the day'), 'MVR ' . $balanceMvr, true] : null,
    ]))])

    <p style="margin:0; font-size:14px; line-height:22px; color:#6B5D4F;">{{ __('Something changed? Message us as early as you can and we\'ll sort it out.') }}</p>
@endsection

@section('footer_note', __('You are receiving this because you booked an event with Bake & Grill.'))
