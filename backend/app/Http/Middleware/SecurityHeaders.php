<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $embeddablePreview = $this->isEmbeddablePreview($request);

        // Content Hub loads draft previews in a same-origin admin iframe.
        $response->headers->set('X-Frame-Options', $embeddablePreview ? 'SAMEORIGIN' : 'DENY');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('X-XSS-Protection', '0'); // modern browsers ignore it; CSP is the real fix
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=()');

        if ($request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        $csp = $this->contentSecurityPolicy($request);
        $csp .= $embeddablePreview ? "; frame-ancestors 'self'" : "; frame-ancestors 'none'";
        $response->headers->set('Content-Security-Policy', $csp);

        return $response;
    }

    /**
     * Staff Content Hub preview surfaces only — keep clickjacking protection elsewhere.
     */
    private function isEmbeddablePreview(Request $request): bool
    {
        if ($request->routeIs('content.preview.website')) {
            return true;
        }

        return $request->query->has('previewToken')
            && ($request->is('order') || $request->is('order/*'));
    }

    private function contentSecurityPolicy(Request $request): string
    {
        $nonce = "'nonce-" . csp_nonce() . "'";

        if ($request->is('admin', 'admin/', 'admin/*')) {
            // data: + blob: required for menu image crop/preview
            return "default-src 'self'; script-src 'self' {$nonce}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.stripe.com https://*.ingest.sentry.io;";
        }

        if ($request->is('pos', 'pos/*')) {
            return "default-src 'self'; script-src 'self' {$nonce}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.stripe.com https://*.ingest.sentry.io; worker-src 'self';";
        }

        if ($request->is('order', 'order/*')) {
            return "default-src 'self'; script-src 'self' {$nonce} https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.stripe.com https://www.google-analytics.com https://www.googletagmanager.com https://*.ingest.sentry.io;";
        }

        if ($request->is('kds', 'kds/*')) {
            return "default-src 'self'; script-src 'self' {$nonce}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self';";
        }

        // Public Blade site: nonced inline scripts, Google Fonts, GA/GTM, and the
        // Cloudflare Web Analytics beacon that Cloudflare injects at the edge.
        return "default-src 'self'; script-src 'self' {$nonce} https://www.googletagmanager.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://cloudflareinsights.com;";
    }
}
