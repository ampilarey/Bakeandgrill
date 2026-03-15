<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class SiteSettingsController extends Controller
{
    /** GET /api/site-settings/public — no auth, returns all public key:value pairs */
    public function public(): JsonResponse
    {
        return response()->json(['settings' => SiteSetting::allPublic()]);
    }

    /** GET /api/site-settings — owner only, returns all settings grouped for admin form */
    public function index(): JsonResponse
    {
        $grouped = SiteSetting::orderBy('id')->get()
            ->groupBy('group')
            ->map(fn ($items) => $items->values());

        return response()->json(['settings' => $grouped]);
    }

    /**
     * PUT /api/site-settings — owner only, bulk update
     * Body: { "settings": { "site_name": "My Cafe", ... } }
     */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'settings'   => 'required|array',
            'settings.*' => 'nullable|string',
        ]);

        foreach ($validated['settings'] as $key => $value) {
            SiteSetting::set($key, $value);
        }

        SiteSetting::bust();

        return response()->json(['message' => 'Settings saved.', 'settings' => SiteSetting::allPublic()]);
    }

    /**
     * POST /api/site-settings/upload — owner only, image upload
     * Multipart: file (image) + key (e.g. "logo")
     *
     * Hero/category image keys (hero_1_image … hero_3_image, cat_1_image … cat_4_image)
     * only store the file and return the URL — the admin UI embeds the URL into the
     * JSON setting value and saves it via the normal PUT endpoint.
     */
    public function upload(Request $request): JsonResponse
    {
        $directKeys = ['logo', 'logo_dark', 'favicon', 'og_image'];
        $jsonKeys   = ['hero_1_image', 'hero_2_image', 'hero_3_image',
                       'cat_1_image',  'cat_2_image',  'cat_3_image',  'cat_4_image'];
        $allowedKeys = array_merge($directKeys, $jsonKeys);

        $request->validate([
            'file' => 'required|file|mimes:png,jpg,jpeg,webp,svg,ico|max:5120',
            'key'  => 'required|string|in:' . implode(',', $allowedKeys),
        ]);

        $file      = $request->file('file');
        $key       = $request->input('key');
        $extension = $file->getClientOriginalExtension();
        $filename  = $key . '_' . Str::random(8) . '.' . $extension;
        $path      = $file->storeAs('site', $filename, 'public');
        $url       = Storage::url($path);

        // For brand assets, auto-save directly to the setting
        if (in_array($key, $directKeys, true)) {
            SiteSetting::set($key, $url);
            SiteSetting::bust();
        }

        return response()->json(['url' => $url]);
    }
}
