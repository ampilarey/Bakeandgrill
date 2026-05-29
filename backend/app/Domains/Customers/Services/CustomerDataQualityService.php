<?php

declare(strict_types=1);

namespace App\Domains\Customers\Services;

use App\Domains\Customers\Support\CustomerPaidOrderQuery;
use App\Models\Customer;
use App\Rules\MaldivesPhone;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

final class CustomerDataQualityService
{
    public function report(): array
    {
        return [
            'duplicate_phones' => $this->duplicatePhones(),
            'missing_names' => $this->missingNames(),
            'invalid_phones' => $this->invalidPhones(),
            'no_order_yet' => $this->noOrderYet(),
            'cancelled_only' => $this->cancelledOnly(),
            'merge_suggestions' => $this->mergeSuggestions(),
        ];
    }

    /** @return array{count: int, rows: list<array<string, mixed>>} */
    private function duplicatePhones(): array
    {
        $rows = Customer::withTrashed()
            ->select('phone', DB::raw('COUNT(*) as cnt'), DB::raw('GROUP_CONCAT(id) as ids'))
            ->groupBy('phone')
            ->havingRaw('COUNT(*) > 1')
            ->limit(50)
            ->get()
            ->map(fn ($r) => [
                'phone' => $r->phone,
                'count' => (int) $r->cnt,
                'customer_ids' => array_map('intval', explode(',', (string) $r->ids)),
            ])
            ->values()
            ->all();

        return ['count' => count($rows), 'rows' => $rows];
    }

    /** @return array{count: int, rows: list<array<string, mixed>>} */
    private function missingNames(): array
    {
        $rows = Customer::query()
            ->where(function ($q): void {
                $q->whereNull('name')->orWhere('name', '');
            })
            ->select('id', 'name', 'phone', 'created_at')
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->map(fn (Customer $c) => [
                'id' => $c->id,
                'phone' => $c->phone,
                'created_at' => $c->created_at?->toIso8601String(),
            ])
            ->all();

        return ['count' => Customer::where(fn ($q) => $q->whereNull('name')->orWhere('name', ''))->count(), 'rows' => $rows];
    }

    /** @return array{count: int, rows: list<array<string, mixed>>} */
    private function invalidPhones(): array
    {
        $rows = [];
        $done = false;
        Customer::query()->select('id', 'phone')->orderBy('id')->chunk(200, function ($chunk) use (&$rows, &$done): void {
            if ($done) {
                return;
            }
            foreach ($chunk as $customer) {
                try {
                    Validator::make(['phone' => $customer->phone], ['phone' => [new MaldivesPhone]])->validate();
                } catch (ValidationException) {
                    $rows[] = ['id' => $customer->id, 'phone' => $customer->phone];
                }
                if (count($rows) >= 100) {
                    $done = true;

                    return;
                }
            }
        });

        return ['count' => count($rows), 'rows' => $rows];
    }

    /** @return array{count: int, rows: list<array<string, mixed>>} */
    private function noOrderYet(): array
    {
        $paidIds = CustomerPaidOrderQuery::base()->distinct()->pluck('customer_id');
        $query = Customer::query()->whereNotIn('id', $paidIds);

        $rows = (clone $query)
            ->select('id', 'name', 'phone', 'created_at')
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->map(fn (Customer $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'phone' => $c->phone,
                'created_at' => $c->created_at?->toIso8601String(),
            ])
            ->all();

        return ['count' => $query->count(), 'rows' => $rows];
    }

    /** @return array{count: int, rows: list<array<string, mixed>>} */
    private function cancelledOnly(): array
    {
        $paidIds = CustomerPaidOrderQuery::base()->distinct()->pluck('customer_id');

        $rows = Customer::query()
            ->whereNotIn('id', $paidIds)
            ->whereHas('orders', fn ($q) => $q->where('status', 'cancelled'))
            ->select('id', 'name', 'phone')
            ->limit(100)
            ->get()
            ->map(fn (Customer $c) => ['id' => $c->id, 'name' => $c->name, 'phone' => $c->phone])
            ->all();

        return ['count' => count($rows), 'rows' => $rows];
    }

    /** @return array{count: int, rows: list<array<string, mixed>>} */
    private function mergeSuggestions(): array
    {
        $rows = [];

        Customer::onlyTrashed()
            ->select('id', 'phone', 'name')
            ->orderByDesc('deleted_at')
            ->limit(100)
            ->get()
            ->each(function (Customer $trashed) use (&$rows): void {
                $active = Customer::where('phone', $trashed->phone)->first();
                if ($active && $active->id !== $trashed->id) {
                    $rows[] = [
                        'reason' => 'trashed_phone_match',
                        'primary_id' => $active->id,
                        'source_id' => $trashed->id,
                        'phone' => $trashed->phone,
                    ];
                }
            });

        Customer::query()
            ->whereNotNull('email')
            ->where('email', '!=', '')
            ->select('email', DB::raw('MIN(id) as primary_id'), DB::raw('GROUP_CONCAT(id) as ids'))
            ->groupBy('email')
            ->havingRaw('COUNT(*) > 1')
            ->limit(25)
            ->get()
            ->each(function ($group) use (&$rows): void {
                $ids = array_map('intval', explode(',', (string) $group->ids));
                $primary = (int) $group->primary_id;
                foreach ($ids as $id) {
                    if ($id !== $primary) {
                        $rows[] = [
                            'reason' => 'duplicate_email',
                            'primary_id' => $primary,
                            'source_id' => $id,
                            'email' => $group->email,
                        ];
                    }
                }
            });

        $rows = array_slice($rows, 0, 50);

        return ['count' => count($rows), 'rows' => $rows];
    }
}
