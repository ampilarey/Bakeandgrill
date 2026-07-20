<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MenuImageProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ImageUploadController extends Controller
{
    private const MAX_SIZE_KB = 10240; // 10 MB pre-process (phone photos); output is much smaller

    private const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

    public function __construct(
        private readonly MenuImageProcessor $processor,
    ) {}

    /**
     * POST /api/admin/upload-image
     * Accepts a single image, normalizes to 1200×900 JPEG, returns the URL.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'image' => [
                'required',
                'image',
                'mimes:jpeg,png,webp',
                'max:' . self::MAX_SIZE_KB,
                'dimensions:max_width=8192,max_height=8192',
            ],
        ]);

        $file = $request->file('image');

        if (!in_array($file->getMimeType(), self::ALLOWED_MIME, true)) {
            return response()->json(['message' => 'Invalid file type.'], 422);
        }

        try {
            $relative = $this->processor->storeProcessed($file, 'menu');
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $url = '/storage/' . ltrim($relative, '/');

        return response()->json([
            'url' => $url,
            'width' => MenuImageProcessor::WIDTH,
            'height' => MenuImageProcessor::HEIGHT,
        ], 201);
    }
}
