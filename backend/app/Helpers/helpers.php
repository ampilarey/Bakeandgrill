<?php

declare(strict_types=1);

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
