<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MenuImageProcessor;
use App\Support\ImageCapabilities;
use App\Support\MenuImageValidation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ImageUploadController extends Controller
{
    public function __construct(
        private readonly MenuImageProcessor $processor,
    ) {}

    /**
     * POST /api/admin/upload-image
     *
     * - image (required): cropped public JPEG
     * - original (optional): full-frame master for later re-crop
     * - purpose (optional): `menu` (default, 1200×900 4:3) or `banner` (1400×600 7:3)
     */
    public function store(Request $request): JsonResponse
    {
        if (MenuImageValidation::looksLikeHeic($request->file('image'))) {
            throw ValidationException::withMessages([
                'image' => [MenuImageValidation::heicRejectedMessage()],
            ]);
        }

        try {
            $request->validate([
                'image' => MenuImageValidation::fileRules(required: true),
                'original' => MenuImageValidation::fileRules(required: false),
                'purpose' => ['sometimes', 'string', Rule::in(['menu', 'banner'])],
            ]);
        } catch (ValidationException $e) {
            if (MenuImageValidation::looksLikeHeic($request->file('image'))) {
                throw ValidationException::withMessages([
                    'image' => [MenuImageValidation::heicRejectedMessage()],
                ]);
            }
            if ($this->looksLikeWebpRejection($request, $e)) {
                throw ValidationException::withMessages([
                    'image' => [MenuImageValidation::webpUnsupportedMessage()],
                ]);
            }
            throw $e;
        }

        $file = $request->file('image');
        $allowed = MenuImageValidation::allowedMimeTypes();
        if (!in_array($file->getMimeType(), $allowed, true)) {
            $message = (!ImageCapabilities::supportsWebp() && $file->getMimeType() === 'image/webp')
                ? MenuImageValidation::webpUnsupportedMessage()
                : 'Invalid file type.';

            return response()->json(['message' => $message], 422);
        }

        $purpose = (string) $request->input('purpose', 'menu');
        $isBanner = $purpose === 'banner';
        $width = $isBanner ? MenuImageProcessor::BANNER_WIDTH : MenuImageProcessor::WIDTH;
        $height = $isBanner ? MenuImageProcessor::BANNER_HEIGHT : MenuImageProcessor::HEIGHT;
        $directory = $isBanner ? 'menu-banners' : 'menu';

        try {
            $processed = $this->processor->storeProcessedPair($file, $directory, $width, $height);
            $thumb = $this->processor->storeThumbnailPair($file);
            $originalUrl = null;
            if ($request->hasFile('original')) {
                $orig = $request->file('original');
                if (!in_array($orig->getMimeType(), $allowed, true)) {
                    return response()->json(['message' => 'Invalid original file type.'], 422);
                }
                $origRelative = $this->processor->storeMaster($orig, 'menu-masters');
                $originalUrl = '/storage/' . ltrim($origRelative, '/');
            }
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $webpUrl = $processed['webp_path']
            ? '/storage/' . ltrim($processed['webp_path'], '/')
            : null;
        $thumbWebpUrl = $thumb['webp_path']
            ? '/storage/' . ltrim($thumb['webp_path'], '/')
            : null;

        return response()->json([
            'url' => '/storage/' . ltrim($processed['path'], '/'),
            'thumb_url' => '/storage/' . ltrim($thumb['path'], '/'),
            'image_webp_url' => $webpUrl,
            'thumb_webp_url' => $thumbWebpUrl,
            'original_url' => $originalUrl,
            'width' => $width,
            'height' => $height,
            'purpose' => $purpose,
        ], 201);
    }

    private function looksLikeWebpRejection(Request $request, ValidationException $e): bool
    {
        if (ImageCapabilities::supportsWebp()) {
            return false;
        }

        $file = $request->file('image');
        if ($file && str_contains(strtolower((string) $file->getMimeType()), 'webp')) {
            return true;
        }

        $messages = collect($e->errors())->flatten()->implode(' ');

        return str_contains(strtolower($messages), 'webp');
    }
}
