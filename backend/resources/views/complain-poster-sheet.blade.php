@php
    /*
     * Owner, 2026-10-03: "Add option to download different sizes. Like A4, A5,
     * 2 posters in 1 A4, 4, 6, 9, etc." One card per sheet at A3 to A6, or
     * several on one A4 to cut apart. The same view prints from the browser
     * and renders as the PDF download, which is why it is laid out with tables
     * and fixed millimetres (the PDF renderer has no flexbox or grid).
     *
     * Then: "I need the exact layout to be printed … font size should be 12, or
     * 10 at the minimum." Every size here comes from PosterCardSpec, which
     * works the card out from its real text with type never under 10pt, so
     * what prints is exactly what was measured. The header and the footer are
     * the same on every layout ("keep the same poster, with the same header
     * and footer, without any change"); only the middle gives way.
     */
    [$cardW, $cardH] = $cardMm;
    [$sheetW, $sheetH] = $sheetMm;
    $pt = $spec['pt'];
    $show = $spec['show'];
    $multi = ($layout['cols'] * $layout['rows']) > 1;
    $contactLine = implode('  ·  ', $contacts['line']);
    $font = $forPdf ? '"DejaVu Sans", sans-serif' : '"DejaVu Sans", Verdana, "Plus Jakarta Sans", -apple-system, "Segoe UI", sans-serif';
    $cards = $layout['cols'] * $layout['rows'];
    $hasFoot = $spec['footH'] > 0;
    $padY = max(2.5, round($spec['padX'] * 0.6, 2));
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Complaint QR – {{ $layout['label'] }} – {{ $siteName }}</title>
    <style>
        @page { size: {{ $layout['paper'] }} {{ $layout['orient'] }}; margin: {{ $marginMm }}mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body { font-family: {!! $font !!}; color: #5A260A; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        table { border-collapse: collapse; border-spacing: 0; }
        td { padding: 0; }
        .grid { width: {{ $cardW * $layout['cols'] }}mm; table-layout: fixed; }
        .cell { width: {{ $cardW }}mm; height: {{ $cardH }}mm; vertical-align: top; @if ($multi) border: 0.25mm dashed #D9BFAA; @endif }
        .card { width: 100%; table-layout: fixed; }
        .hd { height: {{ $spec['headH'] }}mm; background: #FBF1EA; border-bottom: {{ $spec['rule'] }}mm solid #B74B0C; text-align: center; vertical-align: middle; padding: 0 {{ $spec['padX'] }}mm; }
        .hd table { margin: 0 auto; }
        .hd img { width: {{ $spec['logoMm'] }}mm; height: {{ $spec['logoMm'] }}mm; display: block; }
        .hd .gap { width: 3mm; }
        .name { font-size: {{ $pt['name'] }}pt; font-weight: bold; color: #B74B0C; line-height: 1.15; text-align: left; }
        .tagline { font-size: {{ $pt['tagline'] }}pt; color: #7A5A43; line-height: 1.3; text-align: left; }
        .bd { height: {{ $spec['bodyH'] }}mm; text-align: center; vertical-align: middle; padding: 0 {{ $spec['padX'] }}mm; }
        .eyebrow { font-size: {{ $pt['eyebrow'] }}pt; font-weight: bold; letter-spacing: 0.08em; color: #B74B0C; margin: 0 0 1.5mm; line-height: 1.3; }
        .title { font-size: {{ $pt['title'] }}pt; font-weight: bold; color: #B74B0C; line-height: 1.2; margin: 0 0 2mm; }
        .body { font-size: {{ $pt['body'] }}pt; color: #7A5A43; line-height: 1.35; margin: 0 0 3mm; }
        .qr { width: {{ $spec['qrMm'] }}mm; height: {{ $spec['qrMm'] }}mm; display: block; margin: 0 auto 3mm; }
        .url { font-size: {{ $pt['url'] }}pt; font-weight: bold; color: #5A260A; line-height: 1.3; white-space: nowrap; }
        .note { font-size: {{ $pt['note'] }}pt; color: #8A7A6A; margin-top: 1mm; line-height: 1.3; }
        .ft { height: {{ $spec['footH'] }}mm; background: #FBF1EA; border-top: {{ $spec['rule'] }}mm solid #B74B0C; text-align: center; vertical-align: middle; padding: 0 {{ $spec['padX'] }}mm; }
        .contact { font-size: {{ $pt['contact'] }}pt; font-weight: bold; color: #5A260A; line-height: 1.3; }
        .address { font-size: {{ $pt['address'] }}pt; color: #7A5A43; margin-top: 0.8mm; line-height: 1.3; }
        .thanks { font-size: {{ $pt['thanks'] }}pt; font-weight: bold; letter-spacing: 0.04em; color: #B74B0C; margin-top: 0.8mm; line-height: 1.3; }
        @if (!$forPdf)
            /* On screen: the sheet at its real size on a grey desk, with the buttons above it. */
            @media screen {
                body { background: #E9E4DE; padding: 16px; }
                .bar { max-width: {{ $sheetW }}mm; margin: 0 auto 14px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-family: "Plus Jakarta Sans", -apple-system, "Segoe UI", sans-serif; }
                .bar a, .bar button { min-height: 42px; padding: 0 16px; border-radius: 10px; border: 1.5px solid #E8E0D8; background: #fff; color: #1C1408; font: inherit; font-weight: 700; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; cursor: pointer; }
                .bar .primary { background: #B74B0C; border-color: #B74B0C; color: #fff; }
                .bar .what { margin-left: auto; color: #6B5D4F; font-size: 13px; }
                .paper { width: {{ $sheetW }}mm; min-height: {{ $sheetH }}mm; padding: {{ $marginMm }}mm; margin: 0 auto; background: #fff; box-shadow: 0 6px 24px rgba(0,0,0,0.15); }
            }
            @media print { .bar { display: none; } .paper { padding: 0; } }
        @endif
    </style>
</head>
<body>
    @if (!$forPdf)
        <div class="bar">
            <a href="/complain/poster">← All sizes</a>
            <button type="button" class="primary" data-print>Print</button>
            <a href="/complain/poster/sheet.pdf?layout={{ $layoutKey }}" data-testid="sheet-pdf">Download PDF</a>
            <span class="what">{{ $layout['label'] }} · each card {{ round($cardW) }} × {{ round($cardH) }} mm · smallest text {{ rtrim(rtrim(number_format($spec['minPt'], 1), '0'), '.') }} pt{{ $multi ? ' · cut on the dashed lines' : '' }}</span>
        </div>
        <div class="paper">
    @endif
    <table class="grid" data-testid="poster-sheet-grid" data-cards="{{ $cards }}">
        @for ($r = 0; $r < $layout['rows']; $r++)
            <tr>
                @for ($c = 0; $c < $layout['cols']; $c++)
                    <td class="cell">
                        <table class="card">
                            <tr><td class="hd">
                                <table><tr>
                                    @if ($logo)
                                        <td><img src="{{ $logo }}" alt=""></td>
                                        <td class="gap"></td>
                                    @endif
                                    <td>
                                        <div class="name">{{ $siteName }}</div>
                                        @if ($show['tagline'])<div class="tagline">{{ $tagline }}</div>@endif
                                    </td>
                                </tr></table>
                            </td></tr>
                            <tr><td class="bd">
                                @if ($show['eyebrow'])<div class="eyebrow">{{ \App\Support\PosterCardSpec::EYEBROW }}</div>@endif
                                <div class="title">{{ \App\Support\PosterCardSpec::TITLE }}</div>
                                @if ($show['body'])<div class="body">{{ \App\Support\PosterCardSpec::BODY }}</div>@endif
                                <img class="qr" src="{{ $qr }}" alt="QR code to the complaint form">
                                <div class="url">{{ $displayUrl }}</div>
                                @if ($show['note'])<div class="note">{{ \App\Support\PosterCardSpec::NOTE }}</div>@endif
                            </td></tr>
                            @if ($hasFoot)
                                <tr><td class="ft">
                                    @if ($show['contact'])<div class="contact">{{ $contactLine }}</div>@endif
                                    @if ($show['address'])<div class="address">{{ $contacts['address'] }}</div>@endif
                                    @if ($show['thanks'])<div class="thanks">{{ \App\Support\PosterCardSpec::THANKS }}</div>@endif
                                </td></tr>
                            @endif
                        </table>
                    </td>
                @endfor
            </tr>
        @endfor
    </table>
    @if (!$forPdf)
        </div>
        <script nonce="{{ csp_nonce() }}">
            document.querySelector('[data-print]').addEventListener('click', function () { window.print(); });
            @if ($autoPrint)
                window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });
            @endif
        </script>
    @endif
</body>
</html>
