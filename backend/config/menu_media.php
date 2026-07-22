<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Image upload limits
    |--------------------------------------------------------------------------
    */
    'image' => [
        'max_kb' => 10240,
        'max_edge' => 5000,
        // Reject before GD decode if width*height exceeds this (~25 MP).
        'max_megapixels' => 25,
        'mimes' => ['jpeg', 'jpg', 'png', 'webp'],
        'mime_types' => ['image/jpeg', 'image/png', 'image/webp'],
    ],

    'thumb' => [
        'width' => 400,
        'height' => 300,
        'jpeg_quality' => 80,
        'directory' => 'thumbs',
    ],

    /*
    |--------------------------------------------------------------------------
    | Video clip limits (gallery only; no server transcoding)
    |--------------------------------------------------------------------------
    */
    'video' => [
        'max_kb' => 8192,
        'max_seconds' => 10,
        'mimetypes' => ['video/mp4', 'video/webm'],
        'extensions' => ['mp4', 'webm'],
        'directory' => 'item-photos',
    ],
];
