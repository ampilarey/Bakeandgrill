<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Posters (docs/POSTER_PLAN.md, Phase 0)
|--------------------------------------------------------------------------
|
| The print PDF is PDF/X-4. Its output intent names the printing condition
| the colours are meant for; the ICC profile for it is not in the
| repository (the ECI's ISOcoated_v2 is 1.8 MB), so scripts/install-poster-icc.sh
| fetches it once per environment into the path below. Without the file the
| PDF still carries the intent by registry name, and the spike says so.
|
| Read through config(), never env() at call sites (config:cache).
|
*/

return [

    'output_intent' => [
        'condition' => 'FOGRA39 (ISO 12647-2:2004)',
        'identifier' => 'FOGRA39',
        'registry' => 'http://www.color.org',
        'info' => 'Coated FOGRA39 (ISO 12647-2:2004)',
        // Profile components: 4 for a CMYK press profile.
        'components' => 4,
        'profile' => env('POSTER_ICC_PROFILE', storage_path('app/posters/icc/ISOcoated_v2_eci.icc')),
    ],

    // Where TCPDF's converted font files live (made on first use from
    // public/fonts/pdf, never committed).
    'font_cache' => storage_path('app/posters/fonts'),
    // Where finished export zips are kept (one file per export id).
    'export_dir' => storage_path('app/posters/exports'),

    // The brand mark as vector paths.
    'logo_svg' => public_path('brand/logo-animated.svg'),
    'logo_svg_dark' => public_path('brand/logo-animated-dark.svg'),

];
