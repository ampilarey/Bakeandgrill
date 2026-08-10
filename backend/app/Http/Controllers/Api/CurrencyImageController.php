<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Owner-editable photos for the POS close-shift cash count.
 *
 * Each Maldivian denomination (face value in laari) can have a custom photo
 * stored at storage/app/public/currency/{face}.{webp|jpg}. When no custom
 * photo exists the POS falls back to the thumbnail bundled with its build,
 * so this endpoint only ever ADDS overrides — deleting one is always safe.
 */
class CurrencyImageController extends Controller
{
    /** Allowed face values in laari (1 MVR = 100 laari). */
    public const FACES = [
        100_000, 50_000, 10_000, 5_000, 2_000, 1_000, 500, // notes 1000…5
        200, 100, 50, 25, 10, 5, 1,                        // the 7 minted coins
    ];

    private const DIR = 'currency';
    private const MAX_WIDTH = 480;

    /** GET /api/currency-images — public map of face → custom photo URL. */
    public function index(): JsonResponse
    {
        $disk = Storage::disk('public');
        $images = [];
        foreach (self::FACES as $face) {
            foreach (['webp', 'jpg'] as $ext) {
                $rel = self::DIR . "/{$face}.{$ext}";
                if ($disk->exists($rel)) {
                    $v = $disk->lastModified($rel);
                    $images[(string) $face] = "/storage/{$rel}?v={$v}";
                    break;
                }
            }
        }

        return response()->json(['images' => $images]);
    }

    /** POST /api/admin/currency-images/{face} — upload a custom photo. */
    public function store(Request $request, int $face): JsonResponse
    {
        if (!in_array($face, self::FACES, true)) {
            return response()->json(['message' => 'Unknown denomination.'], 422);
        }

        $request->validate([
            'file' => ['required', 'file', 'mimes:png,jpg,jpeg,webp', 'max:10240'],
        ]);

        $file = $request->file('file');
        $binary = @file_get_contents($file->getRealPath());
        if ($binary === false) {
            return response()->json(['message' => 'Could not read the uploaded file.'], 422);
        }

        $image = @imagecreatefromstring($binary);
        if ($image === false) {
            return response()->json(['message' => 'The file is not a readable image.'], 422);
        }

        // Resize down (keep aspect) — these render ~120px wide on an iPad.
        $w = imagesx($image);
        $h = imagesy($image);
        if ($w > self::MAX_WIDTH) {
            $nw = self::MAX_WIDTH;
            $nh = (int) round($h * ($nw / $w));
            $resized = imagecreatetruecolor($nw, $nh);
            imagealphablending($resized, false);
            imagesavealpha($resized, true);
            imagecopyresampled($resized, $image, 0, 0, 0, 0, $nw, $nh, $w, $h);
            imagedestroy($image);
            $image = $resized;
        }

        $disk = Storage::disk('public');
        // Remove both possible extensions so only one override exists per face.
        foreach (['webp', 'jpg'] as $ext) {
            $disk->delete(self::DIR . "/{$face}.{$ext}");
        }

        ob_start();
        if (function_exists('imagewebp')) {
            imagewebp($image, null, 82);
            $ext = 'webp';
        } else {
            imagejpeg($image, null, 82);
            $ext = 'jpg';
        }
        $encoded = (string) ob_get_clean();
        imagedestroy($image);

        $rel = self::DIR . "/{$face}.{$ext}";
        $disk->put($rel, $encoded);
        $v = $disk->lastModified($rel);

        return response()->json([
            'message' => 'Photo updated.',
            'face' => $face,
            'url' => "/storage/{$rel}?v={$v}",
        ]);
    }

    /** DELETE /api/admin/currency-images/{face} — revert to the bundled photo. */
    public function destroy(int $face): JsonResponse
    {
        if (!in_array($face, self::FACES, true)) {
            return response()->json(['message' => 'Unknown denomination.'], 422);
        }

        $disk = Storage::disk('public');
        foreach (['webp', 'jpg'] as $ext) {
            $disk->delete(self::DIR . "/{$face}.{$ext}");
        }

        return response()->json(['message' => 'Reverted to the default photo.', 'face' => $face]);
    }
}
