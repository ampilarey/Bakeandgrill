@php
    /*
     * Pack stickers (owner, 2026-10-04: "I want to print labels like this").
     * The same view prints from the browser and renders as the PDF; every
     * piece is placed in millimetres by StickerDesign, so the two match.
     *
     * @var array<string, mixed> $sheet  @var list<list<list<array>>> $pages
     * @var bool $forPdf  @var bool $autoPrint  @var bool $preview  @var string $pdfUrl
     */
    $mm = fn (float $v): string => rtrim(rtrim(number_format($v, 3, '.', ''), '0'), '.') . 'mm';
    $pageW = $sheet['page_w'];
    $pageH = $sheet['page_h'];
    $s = $sheet['scale'];
    $preview = $preview ?? false;
@endphp
<!DOCTYPE html>
<html lang="{{ $dv ? 'dv' : 'en' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Pack stickers – {{ $sheet['label'] }}</title>
    @unless ($forPdf)
        @foreach (['plus-jakarta-sans-400', 'plus-jakarta-sans-500', 'plus-jakarta-sans-700', 'plus-jakarta-sans-800', 'dm-serif-display-regular', 'dm-serif-display-italic', 'a_faruma'] as $f)
            <link rel="preload" href="/fonts/{{ $f }}.woff2" as="font" type="font/woff2" crossorigin>
        @endforeach
    @endunless
    <style>
        @include('labels.partials.fonts')
        @page { size: {{ $mm($pageW) }} {{ $mm($pageH) }}; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-kerning: none; }
        .page { position: relative; width: {{ $mm($pageW) }}; height: {{ $mm($pageH) }}; overflow: hidden; page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        .pc { position: absolute; margin: 0; padding: 0; }
        .tx { white-space: pre; overflow: visible; }
        .latin { font-size: 0.82em; }
        .cut { position: absolute; border: 0.14mm dashed {{ \App\Domains\Labels\StickerDesign::BORDER }}; }
        @unless ($forPdf)
            @media screen {
                body { background: #E9E4DE; padding: 16px; }
                .bar { max-width: {{ $mm($pageW) }}; margin: 0 auto 14px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-family: 'LabelJ5', -apple-system, 'Segoe UI', sans-serif; }
                .bar a, .bar button { min-height: 42px; padding: 0 16px; border-radius: 10px; border: 1.5px solid #E8E0D8; background: #fff; color: #1C1408; font: inherit; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; cursor: pointer; }
                .bar .primary { background: #B74B0C; border-color: #B74B0C; color: #fff; }
                .bar .what { margin-left: auto; color: #6B5D4F; font-size: 13px; }
                .page { margin: 0 auto 16px; background: #fff; box-shadow: 0 6px 24px rgba(0,0,0,0.15); }
                @if ($preview)
                    body { padding: 0; background: transparent; }
                    .page { box-shadow: none; margin: 0; }
                @endif
            }
            @media print { .bar { display: none; } }
        @endunless
    </style>
</head>
<body>
    @if (!$forPdf && !$preview)
        <div class="bar">
            <button type="button" class="primary" data-print>Print</button>
            @if ($pdfUrl !== '')
                <a href="{{ $pdfUrl }}">PDF</a>
            @endif
            <a href="{{ $pdfUrl }}" data-testid="labels-pdf">Download PDF</a>
            <span class="what">{{ $sheet['label'] }} · {{ $stickerCount }} {{ $stickerCount === 1 ? 'sticker' : 'stickers' }} on {{ count($pages) }} {{ count($pages) === 1 ? 'page' : 'pages' }}@if ($sheet['design'] === 'full' && $s < 0.999) · design at {{ round($s * 100) }}%@endif @if ($sheet['design'] === 'mini') · compact sticker @endif · print at actual size · on a phone, print the PDF</span>
        </div>
    @endif
    @foreach ($pages as $pi => $page)
        <div class="page" data-testid="labels-page">
            @foreach ($sheet['slots'] as $si => $slot)
                @if ($sheet['cut'])
                    <div class="cut" style="left:{{ $mm($slot['x']) }};top:{{ $mm($slot['y']) }};width:{{ $mm($slot['w']) }};height:{{ $mm($slot['h']) }};"></div>
                @endif
                @if (isset($page[$si]))
                    <div class="sticker" data-testid="sticker"></div>
                    @include('labels.partials.pieces', ['pieces' => $page[$si], 'ox' => $slot['x'] + $sheet['dx'], 'oy' => $slot['y'] + $sheet['dy'], 's' => $s])
                @endif
            @endforeach
        </div>
    @endforeach
    @unless ($forPdf)
        <script nonce="{{ csp_nonce() }}">
            (function () {
                function printWhenReady() {
                    var f = document.fonts;
                    var ready = f ? Promise.all(['LabelJ4', 'LabelJ5', 'LabelJ7', 'LabelJ8', 'LabelDS', 'LabelDSI', 'LabelDV'].map(function (n) { return f.load('10pt "' + n + '"'); })).catch(function () {}) : Promise.resolve();
                    ready.then(function () { setTimeout(function () { window.print(); }, 300); });
                }
                var b = document.querySelector('[data-print]');
                if (b) b.addEventListener('click', printWhenReady);
                @if ($autoPrint)
                    window.addEventListener('load', printWhenReady);
                @endif
            })();
        </script>
    @endunless
</body>
</html>
