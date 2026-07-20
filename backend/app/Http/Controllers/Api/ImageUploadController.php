<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MenuImageProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ImageUploadController extends Controller
{
    private const MAX_SIZE_KB = 10240;

    private const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

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
        $request->validate([
            'image' => [
                'required',
                'image',
                'mimes:jpeg,png,webp',
                'max:' . self::MAX_SIZE_KB,
                'dimensions:max_width=8192,max_height=8192',
            ],
            'original' => [
                'sometimes',
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
            $originalUrl = null;
            if ($request->hasFile('original')) {
                $orig = $request->file('original');
                if (!in_array($orig->getMimeType(), self::ALLOWED_MIME, true)) {
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
}
