<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\ContentResolver;
use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class SiteSettingsController extends Controller
{
    /** GET /api/site-settings/public — alias of GET /api/content?app=order_app */
    public function public(): JsonResponse
    {
        $settings = ContentResolver::for('order_app')->allPublic();

        return response()->json(['settings' => $settings]);
    }

    /** GET /api/site-settings — owner only, returns shared-scope settings grouped for admin form */
    public function index(): JsonResponse
    {
        $query = SiteSetting::query()->orderBy('id');
        if (SiteSetting::hasScopeColumn()) {
            $query->where('scope', 'shared');
        }
        $grouped = $query->get()
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
            'settings' => 'required|array',
            'settings.*' => 'nullable|string',
        ]);

        foreach ($validated['settings'] as $key => $value) {
            if (!SiteSetting::where('key', $key)->exists()) {
                continue;
            }
            SiteSetting::set($key, $value);
            if ($key === 'default_item_image' && SiteSetting::hasScopeColumn()) {
                SiteSetting::set($key, $value, 'website');
                SiteSetting::set($key, $value, 'order_app');
            }
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
        $directKeys = ['logo', 'logo_dark', 'favicon', 'og_image', 'default_item_image'];
        $jsonKeys = ['hero_1_image', 'hero_2_image', 'hero_3_image',
            'cat_1_image',  'cat_2_image',  'cat_3_image',  'cat_4_image'];
        $allowedKeys = array_merge($directKeys, $jsonKeys);

        if (\App\Support\MenuImageValidation::looksLikeHeic($request->file('file'))) {
            return response()->json([
                'message' => \App\Support\MenuImageValidation::heicRejectedMessage(),
            ], 422);
        }

        $request->validate([
            'file' => 'required|file|mimes:png,jpg,jpeg,webp,ico|max:5120',
            'key' => 'required|string|in:' . implode(',', $allowedKeys),
        ]);

        $file = $request->file('file');
        $key = $request->input('key');
        $extension = $file->getClientOriginalExtension();
        $filename = $key . '_' . Str::random(8) . '.' . $extension;
        $path = $file->storeAs('site', $filename, 'public');
        $url = Storage::url($path);

        // For brand assets, auto-save directly to the setting
        if (in_array($key, $directKeys, true)) {
            SiteSetting::set($key, $url);
            // Default item photo is consumed by website + order app — keep scopes aligned.
            if ($key === 'default_item_image' && SiteSetting::hasScopeColumn()) {
                SiteSetting::set($key, $url, 'website');
                SiteSetting::set($key, $url, 'order_app');
            }
            SiteSetting::bust();
        }

        return response()->json(['url' => $url]);
    }
}
