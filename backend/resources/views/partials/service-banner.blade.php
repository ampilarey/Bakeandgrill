{{--
    Service maintenance banner for the Blade marketing site (plan §7).

    Rendered inside layout.blade.php between the announcement banner and
    page content. Read-only server-side snippet — the `$serviceBanner`
    array is shared by App\Providers\AppServiceProvider view composer.

    Shape:
      [
        'service_key'    => 'online_checkout',
        'message'        => '…', // plain text, escaped
        'alternatives'   => ['pickup', 'call'],
        'retry_at'       => '2026-07-21T03:00:00+05:00', // optional ISO
        'notify_enabled' => true,
      ]
--}}
@php
    $serviceBanner ??= null;
@endphp
@if($serviceBanner)
    <div
        class="site-service-banner"
        role="status"
        aria-live="polite"
        data-service-key="{{ $serviceBanner['service_key'] ?? '' }}"
        style="
            width:100%;
            padding:0.55rem 1.25rem;
            background:var(--amber-light, #fef3c7);
            border-bottom:1px solid var(--amber, #f59e0b);
            color:var(--dark, #92400e);
            font-size:0.875rem;
            font-weight:600;
            text-align:center;
        "
    >
        <span>{{ $serviceBanner['message'] ?? 'A service is temporarily unavailable.' }}</span>
        @php $alts = $serviceBanner['alternatives'] ?? []; @endphp
        @if(!empty($alts) && is_array($alts))
            <span style="margin-inline-start:0.4rem;font-weight:500;opacity:0.85;">
                (Try: {{ implode(', ', array_map('strval', $alts)) }})
            </span>
        @endif
    </div>
@endif
