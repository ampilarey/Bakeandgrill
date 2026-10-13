@php
    /*
     * The mock-up preview (round 14, 2026-10-13): the first sticker on a jar,
     * a bottle, a box or a lid. Positions are in mm on the scene
     * (StickerMockup::scene); a curved label is drawn once per strip, each
     * strip squeezed by where it sits round the side.
     *
     * @var array<string, mixed> $scene  @var list<array<string, mixed>> $pieces
     * @var float $dx  @var float $dy  @var float $s  @var bool $rounded
     */
    $mm = fn (float $v): string => rtrim(rtrim(number_format($v, 3, '.', ''), '0'), '.') . 'mm';
    $L = $scene['label'];
    $B = $scene['body'];
    $P = $scene['paper'];
    $paperRadius = $scene['round'] ? '50%' : (($rounded ?? false) ? '3mm' : '0.6mm');
@endphp
<div class="mk-floor" style="left:{{ $mm($B['x'] - 4) }};top:{{ $mm(($scene['surface'] === 'lid' ? $B['y'] + $B['h'] * $B['squash'] + $B['rim'] : $B['y'] + $B['h']) - 3) }};width:{{ $mm($B['w'] + ($B['side'] ?? 0) + 8) }};height:6mm;"></div>
@switch($scene['surface'])
    @case('jar')
    @case('bottle')
        <div class="mk-cap mk-{{ $scene['surface'] }}-cap" style="left:{{ $mm($B['cap_x']) }};top:{{ $mm($B['cap_y']) }};width:{{ $mm($B['cap_w']) }};height:{{ $mm($B['cap_h']) }};"></div>
        @if ($B['neck_h'] > 0)
            <div class="mk-neck" style="left:{{ $mm($B['neck_x']) }};top:{{ $mm($B['neck_y']) }};width:{{ $mm($B['neck_w']) }};height:{{ $mm($B['neck_h']) }};"></div>
        @endif
        <div class="mk-body mk-{{ $scene['surface'] }}" style="left:{{ $mm($B['x']) }};top:{{ $mm($B['y']) }};width:{{ $mm($B['w']) }};height:{{ $mm($B['h']) }};"></div>
        @foreach ($scene['strips'] as $st)
            <div class="mk-strip" data-testid="mockup-strip" style="left:{{ $mm($st['px']) }};top:{{ $mm($L['y']) }};width:{{ $mm($st['sw'] + 0.12) }};height:{{ $mm($L['h']) }};transform:scaleX({{ round($st['pw'] / max(0.001, $st['sw']), 4) }});">
                <div class="mk-label" style="left:{{ $mm(-$st['sx']) }};width:{{ $mm($P['w']) }};height:{{ $mm($P['h']) }};">
                    <div class="mk-paper" style="width:{{ $mm($P['w']) }};border-radius:{{ $paperRadius }};"></div>
                    @include('labels.partials.pieces', ['pieces' => $pieces, 'ox' => $dx, 'oy' => $dy, 's' => $s])
                </div>
            </div>
        @endforeach
        <div class="mk-shade" style="left:{{ $mm($B['x']) }};top:{{ $mm($B['y']) }};width:{{ $mm($B['w']) }};height:{{ $mm($B['h']) }};"></div>
        @break
    @case('lid')
        <div class="mk-rim" style="left:{{ $mm($B['x']) }};top:{{ $mm($B['y'] + $B['rim']) }};width:{{ $mm($B['w']) }};height:{{ $mm($B['h'] * $B['squash']) }};"></div>
        <div class="mk-lid" style="left:{{ $mm($B['x']) }};top:{{ $mm($B['y']) }};width:{{ $mm($B['w']) }};height:{{ $mm($B['h']) }};transform:scaleY({{ $B['squash'] }});">
            <div class="mk-flat" style="left:{{ $mm($L['x']) }};top:{{ $mm($L['y']) }};width:{{ $mm($L['w']) }};height:{{ $mm($L['h']) }};">
                <div class="mk-paper" style="width:{{ $mm($L['w']) }};border-radius:{{ $paperRadius }};"></div>
                @include('labels.partials.pieces', ['pieces' => $pieces, 'ox' => $dx, 'oy' => $dy, 's' => $s])
            </div>
            <div class="mk-gloss"></div>
        </div>
        @break
    @default
        <div class="mk-box-top" style="left:{{ $mm($B['x']) }};top:{{ $mm($B['y'] - $B['top']) }};width:{{ $mm($B['w'] + $B['side']) }};height:{{ $mm($B['top']) }};clip-path:polygon({{ $mm($B['side']) }} 0, 100% 0, {{ $mm($B['w']) }} 100%, 0 100%);"></div>
        <div class="mk-box-side" style="left:{{ $mm($B['x'] + $B['w']) }};top:{{ $mm($B['y'] - $B['top']) }};width:{{ $mm($B['side']) }};height:{{ $mm($B['h'] + $B['top']) }};clip-path:polygon(0 {{ $mm($B['top']) }}, 100% 0, 100% {{ $mm($B['h']) }}, 0 100%);"></div>
        <div class="mk-box" style="left:{{ $mm($B['x']) }};top:{{ $mm($B['y']) }};width:{{ $mm($B['w']) }};height:{{ $mm($B['h']) }};"></div>
        <div class="mk-flat" style="left:{{ $mm($L['x']) }};top:{{ $mm($L['y']) }};width:{{ $mm($L['w']) }};height:{{ $mm($L['h']) }};">
            <div class="mk-paper" style="width:{{ $mm($L['w']) }};border-radius:{{ $paperRadius }};"></div>
            @include('labels.partials.pieces', ['pieces' => $pieces, 'ox' => $dx, 'oy' => $dy, 's' => $s])
        </div>
@endswitch
