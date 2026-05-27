<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>@yield('title', $brandSiteName)</title>
    @include('partials.pdf-styles')
    @stack('pdf_head')
</head>
<body>
<div class="pdf-page">
    <div class="pdf-masthead">
        <div class="pdf-masthead-row">
            <div class="pdf-masthead-brand">
                @if (file_exists($brandLogoPdf))
                    <img class="pdf-masthead-logo" src="{{ $brandLogoPdf }}" alt="">
                @endif
                <span>
                    <div class="pdf-masthead-name">{{ $brandSiteName }}</div>
                    <div class="pdf-masthead-tagline">{{ $brandTagline }}</div>
                </span>
            </div>
            <div class="pdf-masthead-meta">
                <div class="pdf-doc-type">@yield('doc_type', 'Document')</div>
                <div class="pdf-doc-number">@yield('doc_number', '')</div>
                @hasSection('doc_status')
                    <span class="pdf-status pdf-status--@yield('doc_status_class', 'paid')">@yield('doc_status')</span>
                @endif
            </div>
        </div>
    </div>

    @yield('meta')

    @yield('content')

    <div class="pdf-footer">
        <strong>{{ $brandSiteName }}</strong>
        @if ($brandAddress)<div>{{ $brandAddress }}</div>@endif
        @if ($brandPhone || $brandEmail)
            <div>
                @if ($brandPhone){{ $brandPhone }}@endif
                @if ($brandPhone && $brandEmail) · @endif
                @if ($brandEmail){{ $brandEmail }}@endif
            </div>
        @endif
        <div style="margin-top:6px; color:#D4813A;">Thank you for choosing {{ $brandSiteName }}</div>
    </div>
</div>
</body>
</html>
