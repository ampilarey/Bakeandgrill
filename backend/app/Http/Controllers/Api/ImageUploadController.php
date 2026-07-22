<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MenuImageProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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
     * - image (required): cropped public JPEG
     * - original (optional): full-frame master for later re-crop
     * - purpose (optional): `menu` (default, 1200×900 4:3) or `banner` (1400×600 7:3)
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
            'purpose' => ['sometimes', 'string', Rule::in(['menu', 'banner'])],
        ]);

        $file = $request->file('image');
        if (!in_array($file->getMimeType(), self::ALLOWED_MIME, true)) {
            return response()->json(['message' => 'Invalid file type.'], 422);
        }

        $purpose = (string) $request->input('purpose', 'menu');
        $isBanner = $purpose === 'banner';
        $width = $isBanner ? MenuImageProcessor::BANNER_WIDTH : MenuImageProcessor::WIDTH;
        $height = $isBanner ? MenuImageProcessor::BANNER_HEIGHT : MenuImageProcessor::HEIGHT;
        $directory = $isBanner ? 'menu-banners' : 'menu';

        try {
            $relative = $this->processor->storeProcessed($file, $directory, $width, $height);
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
            'width' => $width,
            'height' => $height,
            'purpose' => $purpose,
        ], 201);
    }
}
