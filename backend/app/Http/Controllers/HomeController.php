<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Item;
use App\Services\OpeningHoursService;

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

        return view('home', compact('isOpen', 'todayHours', 'featuredItems', 'bestSellers'));
    }

    public function menu()
    {
        $categories = Category::with(['items' => function ($q) {
            $q->where('is_active', true)
                ->where('is_available', true)
                ->orderBy('sort_order')
                ->orderBy('name');
        }])
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        // Get all items with order count for best seller badge
        $allItems = Item::where('is_active', true)
            ->where('is_available', true)
            ->with(['category', 'modifiers'])
            ->withCount(['orderItems' => function ($q) {
                $q->whereHas('order', function ($query) {
                    $query->where('status', '!=', 'cancelled')
                        ->where('created_at', '>=', now()->subDays(30));
                });
            }])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        // Mark top 30% as best sellers
        $threshold = $allItems->max('order_items_count') * 0.3;

        return view('menu', compact('categories', 'allItems', 'threshold'));
    }

    public function contact()
    {
        return view('contact');
    }

    public function hours()
    {
        $openingHours = app(OpeningHoursService::class);
        $isOpen = $openingHours->isOpenNow();
        $hours = config('opening_hours.hours');
        $closureReason = $openingHours->getClosureReason();

        return view('hours', compact('isOpen', 'hours', 'closureReason'));
    }

    public function privacy()
    {
        return view('privacy');
    }

    public function checkout()
    {
        // Get cart items from localStorage (will be accessed via JavaScript)
        // But we need to load actual items from DB to check stock
        return view('checkout');
    }
}
