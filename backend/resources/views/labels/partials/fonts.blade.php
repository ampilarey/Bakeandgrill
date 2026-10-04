{{-- The label fonts, one family per face (dompdf only knows normal and bold).
     The PDF embeds the TTFs from disk; the browser loads the same faces as
     web fonts, so both lay text out on the same measurements. --}}
@foreach (\App\Domains\Labels\LabelText::FONTS as $key => [$family, $pdfFile, $webFile])
    @php
        if ($key === 'dv') {
            $src = $forPdf
                ? (\App\Domains\Content\DhivehiFont::pdfFile() ?? public_path($pdfFile))
                : (\App\Domains\Content\DhivehiFont::isSafePublicUrl($dvUrl = trim((string) content(\App\Domains\Content\DhivehiFont::CONTENT_KEY, ''))) ? $dvUrl : '/' . $webFile);
        } else {
            $src = $forPdf ? public_path($pdfFile) : '/' . $webFile;
        }
        $format = str_ends_with($src, '.woff2') ? 'woff2' : (str_ends_with($src, '.woff') ? 'woff' : (str_ends_with($src, '.otf') ? 'opentype' : 'truetype'));
    @endphp
    @font-face { font-family: '{{ $family }}'; src: url('{{ $src }}') format('{{ $format }}'); font-weight: normal; font-style: normal; @unless ($forPdf) font-display: block; @endunless }
    .f-{{ $key }} { font-family: '{{ $family }}'{{ $key === 'dv' ? ", 'LabelJ7'" : '' }}; font-weight: normal; font-style: normal; }
@endforeach
