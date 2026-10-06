@extends('emails.layout')

@section('title', 'Event request ' . $cateringRequest->reference)
@section('preheader', 'We received your event request ' . $cateringRequest->reference . '. Your quote will follow soon.')
@section('band', 'Events & catering')

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">We've got your request</h1>
    <p style="margin:0 0 22px; color:#6B5D4F;">Hi {{ $recipientName }}, thank you for thinking of us. Our team will look at the details and send your quote soon.</p>

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        ['Reference', $cateringRequest->reference],
        $cateringRequest->event_date ? ['Event date', $cateringRequest->event_date->format('D, j M Y')] : null,
        $cateringRequest->fulfillment_method ? ['Delivery or pickup', ucfirst($cateringRequest->fulfillment_method)] : null,
    ]))])

    <p style="margin:0; font-size:14px; line-height:22px; color:#6B5D4F;">What happens next: we confirm prices and any custom items, then send you a quote you can accept and pay online. Need to change something? Reply to this email or message us.</p>
@endsection

@section('footer_note', 'You are receiving this because you sent an event request to Bake & Grill.')
