@extends('emails.layout')

@php($rust = \App\Support\EmailBrand::variables()['primary'])
@section('title', $dv ? 'ނިއުސްލެޓަރ ކަށަވަރުކުރޭ' : 'Confirm your newsletter')
@section('preheader', $dv ? 'ކަށަވަރުކުރުމަށް ލިންކަށް ފިއްތާ.' : 'One tap to confirm. Nothing comes until you do.')
@section('band', $dv ? 'ނިއުސްލެޓަރ' : 'Newsletter')
@section('hide_complaint', '1')

@section('content')
    <div @if($dv) dir="rtl" lang="dv" @endif>
        <h1 class="eb-h1" style="margin:0 0 12px; font-size:22px; line-height:29px; font-weight:bold; color:#1C1408;">
            {{ $dv ? 'ނިއުސްލެޓަރ ކަށަވަރުކުރޭ' : 'Confirm your newsletter' }}
        </h1>
        <p style="margin:0 0 20px; color:#6B5D4F;">
            {{ $dv ? 'ނިއުސްލެޓަރ ލިބުމަށް ތިރީގައިވާ ބަޓަނަށް ފިއްތާ. ތިބާ ނޫން ނަމަ މި އީމެއިލް ދޫކޮށްލާ.' : 'Tap the button to get our news, new dishes and offers. If this was not you, ignore this email and nothing will come.' }}
        </p>
        <p style="margin:0 0 8px;">
            <a href="{{ $confirmUrl }}" style="display:inline-block; background:{{ $rust }}; color:#FFFDF9; font-weight:bold; text-decoration:none; padding:12px 22px; border-radius:12px;">
                {{ $dv ? 'ކަށަވަރުކުރޭ' : 'Confirm' }}
            </a>
        </p>
    </div>
@endsection
