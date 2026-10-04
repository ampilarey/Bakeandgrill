@php
    /*
     * One label's pieces (StickerDesign), placed at ($ox, $oy) on the page and
     * scaled by $s. Text sits on its baseline: the line box is exactly the
     * font's ascent plus descent, so its top is the baseline less the ascent,
     * in the browser and in dompdf alike.
     *
     * @var list<array<string, mixed>> $pieces
     * @var float $ox  @var float $oy  @var float $s  @var bool $forPdf
     */
    $mm = fn (float $v): string => rtrim(rtrim(number_format($v, 3, '.', ''), '0'), '.') . 'mm';
    $PT = \App\Domains\Labels\LabelText::PT;
    $textHtml = function (string $text, string $font) use ($forPdf): string {
        if ($font !== 'dv' || !\App\Support\ThaanaVisual::hasThaana($text)) {
            return e($text);
        }
        if ($forPdf) {
            $text = \App\Support\ThaanaVisual::order($text);
        }
        // Faruma has no Latin, digits or °: those runs set in Plus Jakarta Sans.
        return (string) preg_replace_callback(
            '/[A-Za-z0-9°\-–+.\/:@&_]+(?:[ .][A-Za-z0-9°\-–+.\/:@&_]+)*/u',
            fn ($m) => '<span class="f-j7 latin">' . e($m[0]) . '</span>',
            e($text),
        );
    };
@endphp
@foreach ($pieces as $p)
    @switch($p['t'])
        @case('rect')
            @php
                $r = isset($p['r']) ? $mm($p['r'] * $s) : '0';
                $radius = array_key_exists('rb', $p) ? "{$r} {$r} 0 0" : $r;
                $border = isset($p['stroke']) ? 'border:' . $mm(($p['sw'] ?? 0.3) * $s) . ' solid ' . $p['stroke'] . ';' : '';
            @endphp
            <div class="pc" style="left:{{ $mm($ox + $p['x'] * $s) }};top:{{ $mm($oy + $p['y'] * $s) }};width:{{ $mm($p['w'] * $s) }};height:{{ $mm($p['h'] * $s) }};{{ isset($p['fill']) ? 'background:' . $p['fill'] . ';' : '' }}{!! $border !!}border-radius:{{ $radius }};"></div>
            @break
        @case('line')
            <div class="pc" style="left:{{ $mm($ox + $p['x'] * $s) }};top:{{ $mm($oy + $p['y'] * $s) }};width:{{ $mm($p['w'] * $s) }};height:0;border-top:{{ $mm(($p['sw'] ?? 0.2) * $s) }} solid {{ $p['color'] }};"></div>
            @break
        @case('img')
            <img class="pc" src="{{ $p['src'] }}" alt="" style="left:{{ $mm($ox + $p['x'] * $s) }};top:{{ $mm($oy + $p['y'] * $s) }};width:{{ $mm($p['w'] * $s) }};height:{{ $mm($p['h'] * $s) }};">
            @break
        @case('text')
            @php
                $size = $p['pt'] * $s;
                $asc = \App\Domains\Labels\LabelText::ascent($p['font']);
                $desc = \App\Domains\Labels\LabelText::descent($p['font']);
                $lh = ($asc + $desc) * $size * $PT;
                // Browsers put the baseline at the line box top plus the ascent
                // (the line box is exactly ascent + descent). dompdf puts it at
                // 0.88 × line height × (ascent + descent), measured for these
                // fonts on 2026-10-04; each gets its own top so both land on
                // the design's baseline.
                $top = $oy + $p['base'] * $s - ($forPdf ? \App\Domains\Labels\LabelText::PDF_BASELINE_K * ($asc + $desc) * $lh : $asc * $size * $PT);
                $align = ['l' => 'left', 'c' => 'center', 'r' => 'right'][$p['align']];
                $rtl = $p['font'] === 'dv' && !$forPdf;
                $ls = isset($p['ls']) ? 'letter-spacing:' . $p['ls'] . 'em;' : '';
            @endphp
            @php
                // Faruma has no bold: thicken by drawing beside itself, about
                // the stroke the original stickers used (size × 0.035 × weight).
                $bold = (float) ($p['bold'] ?? 0);
                $nudge = $bold > 0 ? $size * 0.035 * $bold * $PT : 0.0;
                $offsets = $bold > 0 ? [-$nudge * 0.5, $nudge * 0.5, 0.0] : [0.0];
            @endphp
            @foreach ($offsets as $dx)
            <div class="pc tx f-{{ $p['font'] }}" style="left:{{ $mm($ox + $p['x'] * $s + $dx) }};top:{{ $mm($top) }};width:{{ $mm($p['w'] * $s) }};height:{{ $mm($lh) }};line-height:{{ $mm($lh) }};font-size:{{ round($size, 3) }}pt;color:{{ $p['color'] }};text-align:{{ $align }};{{ $ls }}{{ $rtl ? 'direction:rtl;' : '' }}">{!! $textHtml((string) $p['text'], $p['font']) !!}</div>
            @endforeach
            @break
    @endswitch
@endforeach
