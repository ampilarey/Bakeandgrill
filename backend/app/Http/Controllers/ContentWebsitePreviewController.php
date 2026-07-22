<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Content\ContentDraftStore;
use App\Models\Item;
use App\Services\OpeningHoursService;
use App\Services\SpecialPricingService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Staff-signed Blade preview that renders home with draft overlay.
 */
class ContentWebsitePreviewController extends Controller
{
    public function home(Request $request): Response
    {
        if (!$request->hasValidSignature()) {
            abort(403, 'Invalid or expired preview signature.');
        }

        $token = (string) $request->query('token', '');
        $draft = ContentDraftStore::get($token);
        if (!$draft || ($draft['app'] ?? '') !== 'website') {
            abort(403, 'Invalid or expired preview token.');
        }

        $locale = $draft['locale'] ?? 'en';
        $overrides = $draft['overrides'] ?? [];

        app()->instance('content.draft_overrides', $overrides);
        app()->instance('content.draft_app', 'website');
        app()->instance('content.draft_locale', $locale);

        $openingHours = app(OpeningHoursService::class);
        $isOpen = $openingHours->isOpenNow();
        $todayHours = $openingHours->getTodayHours();

        $bestSellers = Item::query()
            ->where('is_active', true)
            ->where('is_available', true)
            ->with('category')
            ->limit(6)
            ->get();
        $featuredItems = $bestSellers;
        $todaysSpecials = collect(app(SpecialPricingService::class)->activeSpecialsForDisplay());

        $html = view('home', compact('isOpen', 'todayHours', 'featuredItems', 'bestSellers', 'todaysSpecials'))->render();

        return response($html)->header('X-Robots-Tag', 'noindex, nofollow');
    }
}
