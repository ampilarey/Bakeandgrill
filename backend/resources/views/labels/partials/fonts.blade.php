{{-- The label fonts, one family per face (dompdf only knows normal and bold).
     The PDF embeds the TTFs from disk; the browser loads the same faces as
     web fonts, so both lay text out on the same measurements. The Dhivehi
     face is the one Labels → Settings picks (LabelText::dvFace); when it has
     a true bold, that is the family's bold weight and .f-dv.b sets it. --}}
@php $dvFace = \App\Domains\Labels\LabelText::dvFace(); @endphp
@foreach (\App\Domains\Labels\LabelText::FONTS as $key => [$family, $pdfFile, $webFile])
    @php
        $src = $key === 'dv' ? ($forPdf ? $dvFace['pdf'] : $dvFace['web']) : ($forPdf ? public_path($pdfFile) : '/' . $webFile);
        $fmt = fn (string $f): string => str_ends_with($f, '.woff2') ? 'woff2' : (str_ends_with($f, '.woff') ? 'woff' : (str_ends_with($f, '.otf') ? 'opentype' : 'truetype'));
        $boldSrc = $key === 'dv' ? ($forPdf ? $dvFace['bold_pdf'] : $dvFace['bold_web']) : null;
    @endphp
    @font-face { font-family: '{{ $family }}'; src: url('{{ $src }}') format('{{ $fmt($src) }}'); font-weight: normal; font-style: normal; @unless ($forPdf) font-display: block; @endunless }
    @if ($boldSrc !== null)
    @font-face { font-family: '{{ $family }}'; src: url('{{ $boldSrc }}') format('{{ $fmt($boldSrc) }}'); font-weight: bold; font-style: normal; @unless ($forPdf) font-display: block; @endunless }
    @endif
    {{-- Blade's {{ }} turns the quotes around a second family into &#039;,
         which a <style> block does not decode: the rule was dropped and the
         browser preview drew Dhivehi in a system font (found 2026-10-12). --}}
    .f-{{ $key }} { font-family: '{{ $family }}'@if ($key === 'dv'), 'LabelJ7'@endif; font-weight: normal; font-style: normal; }
@endforeach
.f-dv.b { font-weight: bold; }
