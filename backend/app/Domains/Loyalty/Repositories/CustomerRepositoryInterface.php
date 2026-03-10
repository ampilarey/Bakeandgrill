<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Repositories;

use App\Models\Customer;

interface CustomerRepositoryInterface
{
    public function findById(int $id): ?Customer;
}
