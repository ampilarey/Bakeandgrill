@php
    /*
     * Owner, 2026-10-03: "Add option to download different sizes. Like A4, A5,
     * 2 posters in 1 A4, 4, 6, 9, etc." One card per sheet at A3 to A6, or
     * several on one A4 to cut apart. The same view prints from the browser
     * and renders as the PDF download, which is why it is laid out with tables
     * and fixed millimetres (the PDF renderer has no flexbox or grid).
     *
     * Everything on the card scales with it, measured against the A5 card the
     * design was made at. A card too small for all of it drops the extras
     * first (body text, address, tagline), never the code or the address it
     * points at.
     */
    [$cardW, $cardH] = $cardMm;
    [$sheetW, $sheetH] = $sheetMm;
    $s = (float) $scale;
    // Owner, 2026-10-03, "I need more" than 9 a sheet: at 20 and up a card is
    // sticker-sized, so it gets a compact design — name strip, short heading,
    // the code and the address, no footer — and type may go down to 4.2pt.
    $tiny = $s < 0.32;
    $minPt = $tiny ? 4.2 : 5.5;
    $pt = fn (float $base, ?float $min = null): float => max($min ?? $minPt, round($base * $s, 2));
    $full = $s >= 0.7;      // room for everything
    $mid = $s >= 0.55;      // room for the eyebrow and the thank-you line
    $multi = ($layout['cols'] * $layout['rows']) > 1;

    $headH = round($cardH * ($tiny ? 0.15 : 0.14), 2);
    $footH = $tiny ? 0 : round($cardH * ($full ? 0.13 : 0.12), 2);
    $bodyH = round($cardH - $headH - $footH, 2);
    $line = fn (float $points, float $leading = 1.3): float => $points * 0.3528 * $leading;
    $textH = ($mid ? $line($pt(7.5)) + 1.5 * $s : 0)
        + $line($pt(19), 1.2) + 1.5 * $s
        + ($full ? 2 * $line($pt(9.5), 1.35) + 2 * $s : 0)
        + $line($pt(11)) + 1 * $s
        + ($full ? $line($pt(8)) : 0)
        + ($tiny ? 3 : 10 * $s + 4);
    $qrMm = round(max(16, min($cardW * ($tiny ? 0.78 : 0.72), $bodyH - $textH)), 2);
    $title = $tiny ? 'Not happy? Scan & tell us.' : 'Not happy? Tell the owner.';
    $logoMm = round($headH * 0.6, 2);

    $displayUrl = preg_replace('#^https?://#', '', preg_replace('#\?.*$#', '', $url));
    $contactLine = implode('  ·  ', $contacts['line']);
    $font = $forPdf ? '"DejaVu Sans", sans-serif' : '"Plus Jakarta Sans", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
    $cards = $layout['cols'] * $layout['rows'];
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
        .hd { height: {{ $headH }}mm; background: #FBF1EA; border-bottom: {{ max(0.5, round(0.9 * $s, 2)) }}mm solid #B74B0C; text-align: center; vertical-align: middle; }
        .hd table { margin: 0 auto; }
        .hd img { width: {{ $logoMm }}mm; height: {{ $logoMm }}mm; display: block; }
        .hd .gap { width: {{ round(3 * $s, 2) }}mm; }
        .name { font-size: {{ $pt(15, $tiny ? 5 : null) }}pt; font-weight: bold; color: #B74B0C; line-height: 1.15; text-align: left; white-space: nowrap; }
        .tagline { font-size: {{ $pt(9) }}pt; color: #7A5A43; line-height: 1.3; text-align: left; white-space: nowrap; }
        .bd { height: {{ $bodyH }}mm; text-align: center; vertical-align: middle; padding: 0 {{ $tiny ? 1 : round(6 * $s, 2) }}mm; }
        .eyebrow { font-size: {{ $pt(7.5) }}pt; font-weight: bold; letter-spacing: 0.12em; color: #B74B0C; margin: 0 0 {{ round(1.5 * $s, 2) }}mm; }
        .title { font-size: {{ $pt(19) }}pt; font-weight: bold; color: #B74B0C; line-height: 1.2; margin: 0 0 {{ round(1.5 * $s, 2) }}mm; }
        .body { font-size: {{ $pt(9.5) }}pt; color: #7A5A43; line-height: 1.35; margin: 0 0 {{ round(3 * $s, 2) }}mm; }
        .qr { width: {{ $qrMm }}mm; height: {{ $qrMm }}mm; display: block; margin: 0 auto {{ round(2.5 * $s, 2) }}mm; }
        .url { font-size: {{ $pt(11) }}pt; font-weight: bold; color: #5A260A; margin: 0 0 {{ round(1 * $s, 2) }}mm; }
        .note { font-size: {{ $pt(8) }}pt; color: #9C8E7E; margin: 0; }
        .ft { height: {{ $footH }}mm; background: #FBF1EA; border-top: {{ max(0.5, round(0.9 * $s, 2)) }}mm solid #B74B0C; text-align: center; vertical-align: middle; padding: 0 {{ round(4 * $s, 2) }}mm; }
        .contact { font-size: {{ $pt(9.5) }}pt; font-weight: bold; color: #5A260A; }
        .address { font-size: {{ $pt(8) }}pt; color: #7A5A43; margin-top: {{ round(1 * $s, 2) }}mm; }
        .thanks { font-size: {{ $pt(7) }}pt; font-weight: bold; letter-spacing: 0.08em; color: #B74B0C; margin-top: {{ round(1.2 * $s, 2) }}mm; }
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
            <span class="what">{{ $layout['label'] }} · {{ $layout['hint'] }}{{ $multi ? ' · cut on the dashed lines' : '' }}</span>
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
                                        @if ($mid && $tagline !== '')
                                            <div class="tagline">{{ $tagline }}</div>
                                        @endif
                                    </td>
                                </tr></table>
                            </td></tr>
                            <tr><td class="bd">
                                @if ($mid)<div class="eyebrow">COMPLAINT BOX</div>@endif
                                <div class="title">{{ $title }}</div>
                                @if ($full)
                                    <div class="body">Staff, food, service, cleanliness — scan and tell us. Anonymous if you like, or leave your number and we will message you back.</div>
                                @endif
                                <img class="qr" src="{{ $qr }}" alt="QR code to the complaint form">
                                <div class="url">{{ $displayUrl }}</div>
                                @if ($full)<div class="note">Goes straight to the owner's phone.</div>@endif
                            </td></tr>
                            @if (!$tiny)
                                <tr><td class="ft">
                                    @if ($contactLine !== '')<div class="contact">{{ $contactLine }}</div>@endif
                                    @if ($full && $contacts['address'] !== '')<div class="address">{{ $contacts['address'] }}</div>@endif
                                    @if ($mid)<div class="thanks">THANK YOU FOR HELPING US DO BETTER</div>@endif
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
