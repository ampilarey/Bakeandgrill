<?php

declare(strict_types=1);

namespace App\Domains\Catalog\Services;

use App\Domains\Orders\Services\PackagingOptionResolver;
use App\Models\Item;
use App\Models\ItemPackagingOption;

final class PackagingOptionsSyncService
{
    public function __construct(
        private readonly PackagingOptionResolver $resolver = new PackagingOptionResolver,
    ) {}

    /**
     * @param list<array<string, mixed>>|null $rows
     */
    public function sync(Item $item, ?array $rows): void
    {
        if ($rows === null) {
            return;
        }

        $normalized = $this->resolver->normalizeOptionsPayload($rows);
        $keepIds = [];

        foreach ($normalized as $row) {
            $payload = [
                'name' => $row['name'],
                'name_dv' => $row['name_dv'],
                'fee' => $row['fee'],
                'is_default' => $row['is_default'],
                'is_active' => $row['is_active'],
                'sort_order' => $row['sort_order'],
            ];

            if (!empty($row['id'])) {
                $existing = ItemPackagingOption::query()
                    ->where('item_id', $item->id)
                    ->where('id', $row['id'])
                    ->first();
                if ($existing) {
                    $existing->update($payload);
                    $keepIds[] = $existing->id;

                    continue;
                }
            }

            $created = $item->packagingOptions()->create($payload);
            $keepIds[] = $created->id;
        }

        ItemPackagingOption::query()
            ->where('item_id', $item->id)
            ->when($keepIds !== [], fn ($q) => $q->whereNotIn('id', $keepIds))
            ->update(['is_active' => false, 'is_default' => false]);
    }

    /**
     * @return list<array{id: int, name: string, name_dv: ?string, fee: float, is_default: bool, sort_order: int}>
     */
    public function serializeActive(Item $item): array
    {
        $item->loadMissing(['packagingOptions' => fn ($q) => $q->orderBy('sort_order')->orderBy('id')]);

        return $item->packagingOptions
            ->where('is_active', true)
            ->values()
            ->map(fn (ItemPackagingOption $o) => [
                'id' => (int) $o->id,
                'name' => (string) $o->name,
                'name_dv' => $o->name_dv,
                'fee' => (float) $o->fee,
                'is_default' => (bool) $o->is_default,
                'sort_order' => (int) $o->sort_order,
            ])
            ->all();
    }
}
