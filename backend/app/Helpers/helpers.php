<?php

declare(strict_types=1);

if (!function_exists('csp_nonce')) {
    /**
     * Per-request nonce for inline <script> tags, whitelisted by SecurityHeaders'
     * Content-Security-Policy. Inline scripts without this nonce are blocked.
     */
    function csp_nonce(): string
    {
        $attributes = request()->attributes;
        if (!$attributes->has('csp_nonce')) {
            $attributes->set('csp_nonce', base64_encode(random_bytes(16)));
        }

        return $attributes->get('csp_nonce');
    }
}

if (!function_exists('thumb_path')) {
    /**
     * Return thumbnail path for local cafe images (e.g. thumb/images/cafe/file.png), or null.
     */
    function thumb_path(?string $imageUrl): ?string
    {
        if ($imageUrl === null || $imageUrl === '') {
            return null;
        }
        $path = preg_replace('#^https?://[^/]+#', '', $imageUrl);
        $path = trim($path, '/');
        if (str_starts_with($path, 'images/cafe/')) {
            return 'thumb/' . $path;
        }

        return null;
    }
}

if (!function_exists('thumb_url')) {
    /**
     * Return thumbnail URL for local cafe images (faster load). External URLs unchanged.
     */
    function thumb_url(?string $imageUrl): ?string
    {
        $path = thumb_path($imageUrl);
        if ($path !== null) {
            return url($path);
        }

        return $imageUrl;
    }
}
