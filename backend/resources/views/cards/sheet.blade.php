{{-- Printed cards (App\Domains\Cards\CardSheet): every page is one card face, or an A4
     sheet of them with crop marks. Boxes are in mm from the card's top left; dompdf and
     the browser draw them the same way. --}}
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{ $title }}</title>
<style>
@include('labels.partials.fonts', ['forPdf' => $forPdf])
@page { size: {{ $sheet['page_w'] }}mm {{ $sheet['page_h'] }}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
body { background: {{ $forPdf ? '#FFFFFF' : 'transparent' }}; }
.page { position: relative; width: {{ $sheet['page_w'] }}mm; height: {{ $sheet['page_h'] }}mm; overflow: hidden; page-break-after: always; background: #FFFFFF; }
.page.last { page-break-after: auto; }
.card { position: absolute; overflow: hidden; }
.bx { position: absolute; }
.tx { position: absolute; white-space: nowrap; line-height: 1.15; }
.tx.rtl { direction: rtl; unicode-bidi: plaintext; line-height: 1.5; }
.mark { position: absolute; background: #000000; }
@unless ($forPdf)
body.preview { display: flex; gap: 6mm; flex-wrap: wrap; justify-content: center; padding: 4mm; }
body.preview .page { box-shadow: 0 1mm 4mm rgba(0,0,0,.18); border-radius: 3.2mm; }
@endunless
</style>
</head>
<body class="{{ $forPdf ? '' : 'preview' }}">
@foreach ($sheet['pages'] as $pi => $page)
<div class="page {{ $loop->last ? 'last' : '' }}">
    @foreach ($page['cards'] as $card)
    <div class="card" style="left: {{ $card['x'] }}mm; top: {{ $card['y'] }}mm; width: {{ $card['w'] }}mm; height: {{ $card['h'] }}mm;">
        @foreach ($card['boxes'] as $bx)
            @if ($bx['t'] === 'rect')
                <div class="bx" style="left: {{ $bx['x'] }}mm; top: {{ $bx['y'] }}mm; width: {{ $bx['w'] }}mm; height: {{ $bx['h'] }}mm; background: {{ $bx['fill'] }};@isset($bx['r']) border-radius: {{ $bx['r'] }}mm;@endisset @isset($bx['opacity']) opacity: {{ $bx['opacity'] }};@endisset @isset($bx['stroke']) border: 0.3mm solid {{ $bx['stroke'] }}; box-sizing: border-box;@endisset"></div>
            @elseif ($bx['t'] === 'img' && $bx['src'] !== '')
                <img class="bx" src="{{ $bx['src'] }}" alt="" style="left: {{ $bx['x'] }}mm; top: {{ $bx['y'] }}mm; width: {{ $bx['w'] }}mm; height: {{ $bx['h'] }}mm;">
            @elseif ($bx['t'] === 'text')
                <div class="tx f-{{ $bx['font'] }} {{ $bx['rtl'] ? 'rtl' : '' }} {{ $bx['font'] === 'dv' && \App\Domains\Labels\LabelText::dvHasBold() ? 'b' : '' }}" @if ($bx['rtl']) dir="rtl" lang="dv" @endif style="left: {{ $bx['x'] }}mm; top: {{ $bx['y'] }}mm; width: {{ $bx['w'] }}mm; font-size: {{ $bx['pt'] }}pt; color: {{ $bx['color'] }}; text-align: {{ $bx['align'] }};">{{ $bx['text'] }}</div>
            @endif
        @endforeach
    </div>
    @endforeach
    @foreach ($page['marks'] as $mk)
    <div class="mark" style="left: {{ $mk['x'] }}mm; top: {{ $mk['y'] }}mm; width: {{ $mk['w'] }}mm; height: {{ $mk['h'] }}mm;"></div>
    @endforeach
</div>
@endforeach
</body>
</html>
