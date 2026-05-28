<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CustomerAddressService
{
    /** @return Collection<int, CustomerAddress> */
    public function listForCustomer(Customer $customer): Collection
    {
        return $customer->addresses()
            ->orderByDesc('is_default')
            ->orderByDesc('updated_at')
            ->get();
    }

    public function defaultForCustomer(Customer $customer): ?CustomerAddress
    {
        return $customer->addresses()
            ->where('is_default', true)
            ->first()
            ?? $customer->addresses()->orderByDesc('updated_at')->first();
    }

    /** @param array<string, mixed> $data */
    public function create(Customer $customer, array $data): CustomerAddress
    {
        return DB::transaction(function () use ($customer, $data) {
            $isDefault = (bool) ($data['is_default'] ?? false);
            if ($isDefault || !$customer->addresses()->exists()) {
                $this->clearDefaultFlags($customer);
                $isDefault = true;
            }

            return $customer->addresses()->create([
                ...$data,
                'is_default' => $isDefault,
            ]);
        });
    }

    /** @param array<string, mixed> $data */
    public function update(CustomerAddress $address, array $data): CustomerAddress
    {
        return DB::transaction(function () use ($address, $data) {
            if (!empty($data['is_default'])) {
                $this->clearDefaultFlags($address->customer, $address->id);
                $data['is_default'] = true;
            }

            $address->update($data);

            return $address->fresh();
        });
    }

    public function delete(CustomerAddress $address): void
    {
        DB::transaction(function () use ($address) {
            $wasDefault = $address->is_default;
            $customer = $address->customer;
            $address->delete();

            if ($wasDefault) {
                $next = $customer->addresses()->orderByDesc('updated_at')->first();
                if ($next) {
                    $this->setDefault($customer, $next);
                }
            }
        });
    }

    public function setDefault(Customer $customer, CustomerAddress $address): CustomerAddress
    {
        if ($address->customer_id !== $customer->id) {
            abort(404);
        }

        return DB::transaction(function () use ($customer, $address) {
            $this->clearDefaultFlags($customer, $address->id);
            $address->update(['is_default' => true]);

            return $address->fresh();
        });
    }

    /** @param array<string, mixed> $data */
    public function upsertFromDeliveryOrder(Customer $customer, array $data): CustomerAddress
    {
        $payload = [
            'label' => $data['label'] ?? null,
            'address_line1' => $data['address_line1'],
            'address_line2' => $data['address_line2'] ?? null,
            'island' => $data['island'],
            'contact_name' => $data['contact_name'],
            'contact_phone' => $data['contact_phone'],
            'notes' => $data['notes'] ?? null,
            'location_link' => $data['location_link'] ?? null,
        ];

        $existing = $customer->addresses()
            ->where('address_line1', $payload['address_line1'])
            ->where('island', $payload['island'])
            ->first();

        if ($existing) {
            return $this->update($existing, $payload);
        }

        return $this->create($customer, [...$payload, 'is_default' => !$customer->addresses()->exists()]);
    }

    private function clearDefaultFlags(Customer $customer, ?int $exceptId = null): void
    {
        $query = $customer->addresses()->where('is_default', true);
        if ($exceptId) {
            $query->where('id', '!=', $exceptId);
        }
        $query->update(['is_default' => false]);
    }
}
