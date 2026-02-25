<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ImageUploadController extends Controller
{
    private const MAX_SIZE_KB = 4096; // 4 MB
    private const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    /**
     * POST /api/admin/upload-image
     * Accepts a single image file, stores in public disk, returns the URL.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'image' => [
                'required',
                'file',
                'mimes:jpeg,jpg,png,webp,gif',
                'max:' . self::MAX_SIZE_KB,
            ],
        ]);

        $file = $request->file('image');

        if (!in_array($file->getMimeType(), self::ALLOWED_MIME, true)) {
            return response()->json(['message' => 'Invalid file type.'], 422);
        }

        // Sanitised filename: random prefix + original extension
        $ext = strtolower($file->getClientOriginalExtension() ?: 'jpg');
        $filename = Str::uuid() . '.' . $ext;

        // Store in storage/app/public/menu/ (publicly accessible via /storage/menu/)
        $file->storeAs('menu', $filename, 'public');

        $url = asset('storage/menu/' . $filename);

        return response()->json(['url' => $url], 201);
    }
}
