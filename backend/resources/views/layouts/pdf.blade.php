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
        <table class="pdf-masthead-row">
            <tr>
                @if (file_exists($brandLogoPdf))
                    <td class="pdf-masthead-logo-cell">
                        <div class="pdf-masthead-logo"><img src="{{ $brandLogoPdf }}" alt=""></div>
                    </td>
                @endif
                <td>
                    <div class="pdf-masthead-name">{{ $brandSiteName }}</div>
                    <div class="pdf-masthead-tagline">{{ $brandTagline }}</div>
                </td>
                <td class="pdf-masthead-meta">
                    <div class="pdf-doc-type">@yield('doc_type', 'Document')</div>
                    <div class="pdf-doc-number">@yield('doc_number', '')</div>
                    @hasSection('doc_status')
                        <span class="pdf-status pdf-status--@yield('doc_status_class', 'paid')">@yield('doc_status')</span>
                    @endif
                </td>
            </tr>
        </table>
    </div>

    @yield('meta')

    @yield('content')

    <div class="pdf-footer">
        @if (file_exists($brandLogoPdf))
            <img class="pdf-footer-logo" src="{{ $brandLogoPdf }}" alt="">
        @endif
        <strong>{{ $brandSiteName }}</strong>
        @if ($brandAddress)<div>{{ $brandAddress }}</div>@endif
        @if ($brandPhone || $brandEmail)
            <div>
                @if ($brandPhone){{ $brandPhone }}@endif
                @if ($brandPhone && $brandEmail) · @endif
                @if ($brandEmail){{ $brandEmail }}@endif
            </div>
        @endif
        <div class="pdf-footer-thanks">Thank you for choosing {{ $brandSiteName }}</div>
    </div>
</div>
</body>
</html>
