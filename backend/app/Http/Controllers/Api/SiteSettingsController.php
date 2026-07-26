<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\ContentResolver;
use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;

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
}
