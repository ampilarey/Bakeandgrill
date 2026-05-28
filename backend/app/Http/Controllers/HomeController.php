<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Item;
use App\Services\OpeningHoursService;
use App\Services\SpecialPricingService;

class HomeController extends Controller
{
    public function index()
    {
        $openingHours = app(OpeningHoursService::class);
        $isOpen = $openingHours->isOpenNow();
        $todayHours = $openingHours->getTodayHours();

        // Get best selling items (most ordered)
        $bestSellers = Item::where('is_active', true)
            ->where('is_available', true)
            ->with('category')
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
            ->with('category')
            ->inRandomOrder()
            ->limit(6)
            ->get();

        $pricing = app(SpecialPricingService::class);
        $todaysSpecials = collect($pricing->activeSpecialsForDisplay());

        return view('home', compact('isOpen', 'todayHours', 'featuredItems', 'bestSellers', 'todaysSpecials'));
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
