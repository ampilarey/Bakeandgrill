@extends('emails.layout')

@section('title', __('Event request :ref', ['ref' => $cateringRequest->reference]))
@section('preheader', __('We received your event request :ref. Your quote will follow soon.', ['ref' => $cateringRequest->reference]))
@section('band', __('Events & catering'))

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">{{ __('We\'ve got your request') }}</h1>
    <p style="margin:0 0 22px; color:#6B5D4F;">{{ __('Hi :name, thank you for thinking of us. Our team will look at the details and send your quote soon.', ['name' => $recipientName]) }}</p>

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        [__('Reference'), $cateringRequest->reference],
        $cateringRequest->event_date ? [__('Event date'), $cateringRequest->event_date->format('D, j M Y')] : null,
        $cateringRequest->fulfillment_method ? [__('Delivery or pickup'), __(ucfirst($cateringRequest->fulfillment_method))] : null,
    ]))])

    <p style="margin:0; font-size:14px; line-height:22px; color:#6B5D4F;">{{ __('What happens next: we confirm prices and any custom items, then send you a quote you can accept and pay online. Need to change something? Reply to this email or message us.') }}</p>
@endsection

@section('footer_note', __('You are receiving this because you sent an event request to Bake & Grill.'))
