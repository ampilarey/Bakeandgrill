<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Domains\Permissions\Services\PermissionService;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\PosMenuBuilder;
use App\Services\PosPopularNowService;
use App\Services\PosQuickKeyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Single-shot POS menu feed — categories + channel-filtered items in
 * one round trip, without the N+1 availability queries the public
 * /items endpoint runs per row.
 */
class PosMenuController extends Controller
{
    public function index(
        Request $request,
        PosMenuBuilder $menuBuilder,
    ): JsonResponse {
        $user = $request->user();
        if (!$user?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $channel = $request->query('channel');
        if (!is_string($channel) || !in_array($channel, KitchenMenuResolver::CHANNELS, true)) {
            $channel = 'dine_in';
        }

        $menu = $menuBuilder->build($channel);

        return response()->json([
            'categories' => $menu['categories'],
            'items' => $menu['items'],
            // anchor item id => suggested item ids, ranked by lift. Travels
            // with the menu so the chips survive an offline till.
            'pairings' => $menu['pairings'],
        ] + self::tillTabs($menu, $user));
    }

    /**
     * The Quick and Popular-now tabs, for both menu feeds. In the payload
     * rather than their own endpoints so the cached menu carries them offline.
     *
     * @param array{items: \Illuminate\Support\Collection<int, array<string, mixed>>} $menu
     * @return array<string, mixed>
     */
    public static function tillTabs(array $menu, User $user): array
    {
        $itemIds = $menu['items']->pluck('id')->map('intval')->values()->all();

        return [
            'quick_keys' => app(PosQuickKeyService::class)->forUser((int) $user->id),
            'can_manage_shared_quick_keys' => app(PermissionService::class)->hasPermission($user, 'menu.manage'),
            'popular_now' => app(PosPopularNowService::class)->rank($itemIds),
        ];
    }
}
