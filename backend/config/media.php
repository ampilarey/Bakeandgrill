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
    | Disable FFmpeg pipeline (tests / hosts without binaries)
    |--------------------------------------------------------------------------
    */

    'ffmpeg_disabled' => (bool) env('FFMPEG_DISABLED', false),

];
