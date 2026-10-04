@php
    /*
     * The A4 box label (owner, 2026-10-04; box_label_template.py and
     * box_label_nh_kuda_rah.py). Pieces from BoxLabel, placed in millimetres,
     * so the browser print and the PDF match.
     *
     * @var list<array<string, mixed>> $pieces  @var bool $forPdf  @var bool $autoPrint  @var string $pdfUrl  @var string $title
     */
    $dv = false;
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>{{ $title }}</title>
    @unless ($forPdf)
        @foreach (['plus-jakarta-sans-400', 'plus-jakarta-sans-500', 'plus-jakarta-sans-700', 'plus-jakarta-sans-800', 'dm-serif-display-regular', 'dm-serif-display-italic'] as $f)
            <link rel="preload" href="/fonts/{{ $f }}.woff2" as="font" type="font/woff2" crossorigin>
        @endforeach
    @endunless
    <style>
        @include('labels.partials.fonts')
        @page { size: 210mm 297mm; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-kerning: none; }
        .page { position: relative; width: 210mm; height: 297mm; overflow: hidden; }
        .pc { position: absolute; margin: 0; padding: 0; }
        .tx { white-space: pre; overflow: visible; }
        .latin { font-size: 0.82em; }
        @unless ($forPdf)
            @media screen {
                body { background: #E9E4DE; padding: 16px; }
                .bar { max-width: 210mm; margin: 0 auto 14px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-family: 'LabelJ5', -apple-system, 'Segoe UI', sans-serif; }
                .bar a, .bar button { min-height: 42px; padding: 0 16px; border-radius: 10px; border: 1.5px solid #E8E0D8; background: #fff; color: #1C1408; font: inherit; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; cursor: pointer; }
                .bar .primary { background: #B74B0C; border-color: #B74B0C; color: #fff; }
                .bar .what { margin-left: auto; color: #6B5D4F; font-size: 13px; }
                .page { margin: 0 auto; background: #fff; box-shadow: 0 6px 24px rgba(0,0,0,0.15); }
            }
            @media print { .bar { display: none; } }
        @endunless
    </style>
</head>
<body>
    @unless ($forPdf)
        <div class="bar">
            <button type="button" class="primary" data-print>Print</button>
            <a href="{{ $pdfUrl }}" data-testid="labels-pdf">Download PDF</a>
            <span class="what">Box label · A4 · print at actual size</span>
        </div>
    @endunless
    <div class="page" data-testid="labels-page">
        @include('labels.partials.pieces', ['pieces' => $pieces, 'ox' => 0, 'oy' => 0, 's' => 1.0])
    </div>
    @unless ($forPdf)
        <script nonce="{{ csp_nonce() }}">
            (function () {
                function printWhenReady() {
                    var f = document.fonts;
                    var ready = f ? Promise.all(['LabelJ4', 'LabelJ5', 'LabelJ7', 'LabelJ8', 'LabelDS', 'LabelDSI'].map(function (n) { return f.load('10pt "' + n + '"'); })).catch(function () {}) : Promise.resolve();
                    ready.then(function () { setTimeout(function () { window.print(); }, 300); });
                }
                document.querySelector('[data-print]').addEventListener('click', printWhenReady);
                @if ($autoPrint)
                    window.addEventListener('load', printWhenReady);
                @endif
            })();
        </script>
    @endunless
</body>
</html>
