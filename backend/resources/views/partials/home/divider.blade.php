@php
    /** @var array<string, mixed> $blockSettings */
    $dvStyle = ($blockSettings['style'] ?? 'spacer') === 'rule' ? 'rule' : 'spacer';
    $dvSize = (string) ($blockSettings['size'] ?? 'md');
    $dvHeight = match ($dvSize) {
        'sm' => '1.25rem',
        'lg' => '4rem',
        default => '2.5rem',
    };
@endphp

<div
    data-home-block="divider"
    data-divider-style="{{ $dvStyle }}"
    data-divider-size="{{ in_array($dvSize, ['sm', 'md', 'lg'], true) ? $dvSize : 'md' }}"
    aria-hidden="true"
    style="height:{{ $dvHeight }}; {{ $dvStyle === 'rule' ? 'border-bottom:1px solid var(--border); margin:0 auto; max-width:1100px;' : '' }}"
></div>
