<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MenuImageProcessor;
use App\Support\ImageCapabilities;
use App\Support\MenuImageValidation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ImageUploadController extends Controller
{
    public function __construct(
        private readonly MenuImageProcessor $processor,
    ) {}

    /**
     * POST /api/admin/upload-image
     *
     * - image (required): 4:3 crop → public 1200×900
     * - original (optional): full-frame master for later re-crop
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $request->validate([
                'image' => MenuImageValidation::fileRules(required: true),
                'original' => MenuImageValidation::fileRules(required: false),
            ]);
        } catch (ValidationException $e) {
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

        try {
            $relative = $this->processor->storeProcessed($file, 'menu');
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

        return response()->json([
            'url' => '/storage/' . ltrim($relative, '/'),
            'original_url' => $originalUrl,
            'width' => MenuImageProcessor::WIDTH,
            'height' => MenuImageProcessor::HEIGHT,
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
