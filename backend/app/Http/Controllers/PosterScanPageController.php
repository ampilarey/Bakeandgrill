<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Posters\PosterContent;
use App\Domains\Posters\PosterLink;
use App\Models\Poster;
use App\Models\PosterScan;
use Illuminate\Http\RedirectResponse;

/**
 * /p/{code}: count the scan, then open the dish, offer, or page the poster
 * points at. The row stores the poster and the time only.
 */
class PosterScanPageController extends Controller
{
    public function show(string $code): RedirectResponse
    {
        $code = strtoupper(trim($code));
        $id = PosterLink::valid($code) ? Poster::idFromCode($code) : null;
        $poster = $id !== null ? Poster::query()->find($id) : null;
        if ($poster === null) {
            return redirect('/menu');
        }

        PosterScan::query()->create([
            'poster_id' => $poster->id,
            'created_at' => now(),
        ]);

        $target = PosterContent::livePath($poster->toArray());
        if (str_starts_with($target, 'http://') || str_starts_with($target, 'https://')) {
            return redirect()->away($target);
        }

        return redirect($target !== '' ? $target : '/menu');
    }
}
