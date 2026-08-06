<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Resolves and validates the single allowed "collect tomorrow" date from the
 * owner cutoff setting. Never trust a browser-supplied calendar date.
 */
class OrderFulfilDateService
{
    public const SETTING_KEY = 'order_for_tomorrow_cutoff';

    public const DEFAULT_CUTOFF = '20:00';

    /** Cutoff as HH:mm in app timezone. */
    public function cutoffTime(): string
    {
        $raw = trim((string) SiteSetting::get(self::SETTING_KEY, self::DEFAULT_CUTOFF));
        if (!preg_match('/^\d{1,2}:\d{2}$/', $raw)) {
            return self::DEFAULT_CUTOFF;
        }

        try {
            $parsed = Carbon::createFromFormat('H:i', $raw, $this->timezone());

            return $parsed->format('H:i');
        } catch (\Throwable) {
            return self::DEFAULT_CUTOFF;
        }
    }

    /**
     * The single calendar date customers may pick as "Tomorrow".
     * Before cutoff: tomorrow. At/after cutoff: the day after tomorrow.
     */
    public function allowedTomorrowDate(?Carbon $at = null): Carbon
    {
        $at = ($at ?? now())->clone()->setTimezone($this->timezone());
        $cutoff = $this->cutoffCarbonOn($at);

        $base = $at->clone()->startOfDay()->addDay();
        if ($at->gte($cutoff)) {
            $base->addDay();
        }

        return $base;
    }

    public function allowedTomorrowDateString(?Carbon $at = null): string
    {
        return $this->allowedTomorrowDate($at)->toDateString();
    }

    /**
     * Resolve fulfil_date from a customer intent.
     *
     * @param  string|null  $requested  Y-m-d from the client (ignored unless it matches the allowed tomorrow)
     * @param  string|null  $intent  "today" | "tomorrow" | null
     * @return string|null  Y-m-d for tomorrow collection, or null for same-day
     */
    public function resolveForCustomerOrder(?string $requested, ?string $intent = null, ?Carbon $at = null): ?string
    {
        $wantsTomorrow = $intent === 'tomorrow'
            || ($requested !== null && $requested !== '');

        if (!$wantsTomorrow) {
            return null;
        }

        // Kill switch / schedule: single enforcement point for every create path
        // (pickup and delivery). Example: all drivers sick — flip the gate off
        // and no new tomorrow orders can be placed.
        if (!app(FeatureGateService::class)->open('order_for_tomorrow', $at)) {
            throw ValidationException::withMessages([
                'fulfil_date' => ['Ordering for tomorrow is switched off right now. Please order for today or try again later.'],
            ]);
        }

        $allowed = $this->allowedTomorrowDateString($at);

        if ($requested !== null && $requested !== '' && $requested !== $allowed) {
            throw ValidationException::withMessages([
                'fulfil_date' => [
                    "Collect tomorrow is only available for {$allowed}. Please refresh and try again.",
                ],
            ]);
        }

        return $allowed;
    }

    /**
     * Tomorrow orders may only include items the owner ticked for tomorrow.
     *
     * @param  list<int>  $itemIds
     */
    public function assertAllItemsAllowTomorrow(array $itemIds): void
    {
        $ids = array_values(array_unique(array_map('intval', $itemIds)));
        if ($ids === []) {
            throw ValidationException::withMessages([
                'items' => ['Add at least one item to collect tomorrow.'],
            ]);
        }

        $allowedCount = Item::query()
            ->whereIn('id', $ids)
            ->where('allow_pre_order', true)
            ->count();

        if ($allowedCount !== count($ids)) {
            throw ValidationException::withMessages([
                'fulfil_date' => [
                    'Some items in this order cannot be collected tomorrow. Remove them or choose today.',
                ],
            ]);
        }
    }

    /** Public payload fragment for GET /ordering/status. */
    public function statusFragment(?Carbon $at = null): array
    {
        $gate = app(FeatureGateService::class);
        $masterOpen = $gate->open('order_for_tomorrow', $at);

        return [
            'cutoff' => $this->cutoffTime(),
            'collect_tomorrow_date' => $this->allowedTomorrowDateString($at),
            'enabled' => $gate->enabled('order_for_tomorrow'),
            'open' => $masterOpen,
            'modes' => [
                'pickup' => [
                    'enabled' => $gate->enabled('tomorrow_pickup'),
                    'open' => $masterOpen && $gate->open('tomorrow_pickup', $at),
                ],
                'delivery' => [
                    'enabled' => $gate->enabled('tomorrow_delivery'),
                    'open' => $masterOpen && $gate->open('tomorrow_delivery', $at),
                ],
                'dine_in' => [
                    'enabled' => $gate->enabled('tomorrow_dine_in'),
                    'open' => $masterOpen && $gate->open('tomorrow_dine_in', $at),
                ],
            ],
        ];
    }

    private function timezone(): string
    {
        return (string) config('app.timezone', 'UTC');
    }

    private function cutoffCarbonOn(Carbon $at): Carbon
    {
        $time = $this->cutoffTime();

        return Carbon::createFromFormat('H:i', $time, $this->timezone())
            ->setDateFrom($at);
    }
}
