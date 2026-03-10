<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Repositories;

use App\Models\Item;

class EloquentItemRepository implements ItemRepositoryInterface
{
    public function findById(int $id): ?Item
    {
        return Item::find($id);
    }

    /** @param string[] $relations */
    public function findActiveById(int $id, array $relations = []): ?Item
    {
        $query = Item::where('id', $id)
            ->where('is_active', true)
            ->where('is_available', true);

        if (!empty($relations)) {
            $query->with($relations);
        }

        return $query->first();
    }
}
