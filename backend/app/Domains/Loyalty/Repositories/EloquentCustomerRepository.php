<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Repositories;

use App\Models\Customer;

class EloquentCustomerRepository implements CustomerRepositoryInterface
{
    public function findById(int $id): ?Customer
    {
        return Customer::find($id);
    }
}
