<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Promotions\Services\OffersService;
use App\Models\Item;
use App\Services\OpeningHoursService;
use App\Services\SpecialPricingService;

class HomeController extends Controller
{
    public function index()
    {
        // A table's QR card printed before 2026-10-12 encodes the site root
        // with the token; the order app is where a seated guest belongs.
        $tableToken = (string) request()->query('table', '');
        if (preg_match('/^[A-Za-z0-9]{24}$/', $tableToken)) {
            return redirect('/order/?table=' . $tableToken);
        }

        $openingHours = app(OpeningHoursService::class);
        $isOpen = $openingHours->isOpenNow();
        $todayHours = $openingHours->getTodayHours();

        // Get best selling items (most ordered). An item the owner keeps out of
        // the best sellers (water and other staples, 2026-10-13) never leads here.
        $bestSellers = Item::where('is_active', true)
            ->where('is_available', true)
            ->where('hide_from_bestsellers', false)
            ->with(['category', 'variants'])
            ->withCount(['orderItems' => function ($q) {
                $q->whereHas('order', function ($query) {
                    $query->where('status', '!=', 'cancelled')
                        ->where('created_at', '>=', now()->subDays(30));
                });
            }])
            ->orderBy('order_items_count', 'desc')
            ->limit(6)
            ->get();

        // Fallback to random items if no orders yet
        $featuredItems = $bestSellers->count() > 0 ? $bestSellers : Item::where('is_active', true)
            ->where('is_available', true)
            ->with(['category', 'variants'])
            ->inRandomOrder()
            ->limit(6)
            ->get();

        $pricing = app(SpecialPricingService::class);
        $todaysSpecials = collect($pricing->activeSpecialsForDisplay());
        $offers = collect(app(OffersService::class)->activeOffers());

        return view('home', compact('isOpen', 'todayHours', 'featuredItems', 'bestSellers', 'todaysSpecials', 'offers'));
    }

    public function contact()
    {
        return view('contact');
    }

    public function hours()
    {
        $openingHours = app(OpeningHoursService::class);
        $isOpen = $openingHours->isOpenNow();
        $hours = $openingHours->getHoursForDisplay();
        $closureReason = $openingHours->getClosureReason();

        return view('hours', compact('isOpen', 'hours', 'closureReason'));
    }

    public function privacy()
    {
        return view('privacy');
    }

    public function terms()
    {
        return view('terms');
    }

    public function refund()
    {
        return view('refund');
    }
}
