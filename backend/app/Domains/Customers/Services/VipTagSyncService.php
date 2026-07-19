<?php

declare(strict_types=1);

namespace App\Domains\Customers\Services;

use App\Models\Customer;
use App\Models\CustomerTag;

/**
 * Keeps the seeded "VIP" CRM tag aligned with computed VIP segment status.
 */
final class VipTagSyncService
{
    public const TAG_NAME = 'VIP';

    public function __construct(
        private readonly CustomerSegmentationService $segments,
        private readonly VipSettingsService $settings,
    ) {}

    public function syncCustomer(Customer $customer): bool
    {
        if (!$this->settings->autoSyncTag()) {
            return false;
        }

        $tag = $this->vipTag();
        $isVip = $this->segments->customerIsVip($customer);
        $hasTag = $customer->tags()->where('customer_tags.id', $tag->id)->exists();

        if ($isVip && !$hasTag) {
            $customer->tags()->syncWithoutDetaching([$tag->id => ['assigned_by' => null]]);

            return true;
        }

        if (!$isVip && $hasTag) {
            $customer->tags()->detach($tag->id);

            return true;
        }

        return false;
    }

    /** @return array{synced: int, vip_count: int} */
    public function syncAll(): array
    {
        if (!$this->settings->autoSyncTag()) {
            return ['synced' => 0, 'vip_count' => $this->segments->segmentCount('vip_customers')];
        }

        $tag = $this->vipTag();
        $vipIds = $this->segments->customerIdsInSegment('vip_customers');
        $changed = 0;

        // Attach missing VIP tags
        $alreadyTagged = $tag->customers()->whereIn('customers.id', $vipIds)->pluck('customers.id');
        $toAttach = $vipIds->diff($alreadyTagged);
        foreach ($toAttach as $customerId) {
            $tag->customers()->syncWithoutDetaching([(int) $customerId => ['assigned_by' => null]]);
            $changed++;
        }

        // Detach VIP tag from non-VIP customers who still have it
        $staleIds = $tag->customers()
            ->whereNotIn('customers.id', $vipIds->isEmpty() ? [0] : $vipIds)
            ->pluck('customers.id');
        if ($staleIds->isNotEmpty()) {
            $tag->customers()->detach($staleIds->all());
            $changed += $staleIds->count();
        }

        return [
            'synced' => $changed,
            'vip_count' => $vipIds->count(),
        ];
    }

    private function vipTag(): CustomerTag
    {
        return CustomerTag::firstOrCreate(
            ['name' => self::TAG_NAME],
            [
                'color' => '#D4813A',
                'description' => 'High-value repeat customer (auto-synced with VIP segment)',
            ],
        );
    }
}
