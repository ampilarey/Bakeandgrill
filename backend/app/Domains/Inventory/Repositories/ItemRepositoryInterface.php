<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Repositories;

use App\Models\Item;

interface ItemRepositoryInterface
{
    public function findById(int $id): ?Item;

    /** @param string[] $relations */
    public function findActiveById(int $id, array $relations = []): ?Item;
}
