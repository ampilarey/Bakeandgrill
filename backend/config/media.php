<?php

declare(strict_types=1);

return [

    // Do not read FFMPEG_PATH via env() at call sites — after config:cache
    // Laravel stops loading .env and env() returns null (silent production break).
    'ffmpeg_path' => env('FFMPEG_PATH', ''),

    // Do not read FFPROBE_PATH via env() at call sites — same config:cache reason.
    'ffprobe_path' => env('FFPROBE_PATH', ''),

    /*
    |--------------------------------------------------------------------------
    | Alternate public asset host (ASSET_URL)
    |--------------------------------------------------------------------------
    |
    | Used when matching stored media URLs whose host differs from APP_URL
    | (CDN / asset domain). Read via config('media.asset_url'), never env().
    |
    */

    'asset_url' => env('ASSET_URL'),

    /*
    |--------------------------------------------------------------------------
    | Disable FFmpeg pipeline (tests / hosts without binaries)
    |--------------------------------------------------------------------------
    */

    'ffmpeg_disabled' => (bool) env('FFMPEG_DISABLED', false),

];
