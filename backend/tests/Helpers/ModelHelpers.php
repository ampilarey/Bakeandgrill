<?php

declare(strict_types=1);

namespace Tests\Helpers;

use App\Domains\Payments\Services\GiftCardCodeService;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\GiftCard;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Convenience factory helpers for all test classes.
 *
 * Mix into any TestCase subclass:
 *   use \Tests\Helpers\ModelHelpers;
 *
 * These methods return persisted models (using RefreshDatabase isolation),
 * so they can only be used in tests that pull in RefreshDatabase.
 */
trait ModelHelpers
{
    // ── Staff / Users ─────────────────────────────────────────────────────────

    protected function makeStaff(string $role = 'staff', array $attrs = []): User
    {
        $roleModel = Role::firstOrCreate(
            ['slug' => $role],
            ['name' => ucfirst($role), 'description' => '', 'is_active' => true],
        );

        return User::factory()->create(array_merge([
            'role_id' => $roleModel->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ], $attrs));
    }

    protected function makeOwner(array $attrs = []): User
    {
        return $this->makeStaff('owner', $attrs);
    }

    protected function makeManager(array $attrs = []): User
    {
        return $this->makeStaff('manager', $attrs);
    }

    protected function makeKitchenStaff(array $attrs = []): User
    {
        return $this->makeStaff('kitchen_staff', $attrs);
    }

    // ── Customers ─────────────────────────────────────────────────────────────

    protected function makeCustomer(array $attrs = []): Customer
    {
        return Customer::factory()->create($attrs);
    }

    // ── Menu ──────────────────────────────────────────────────────────────────

    protected function makeCategory(array $attrs = []): Category
    {
        return Category::factory()->create($attrs);
    }

    protected function makeItem(bool $trackStock = false, int $stock = 10, array $attrs = []): Item
    {
        if ($trackStock) {
            return Item::factory()->prepared($stock)->create($attrs);
        }

        return Item::factory()->madeToOrder()->create($attrs);
    }

    // ── Devices ───────────────────────────────────────────────────────────────

    protected function makeDevice(string $type = 'pos', array $attrs = []): Device
    {
        return Device::factory()->create(array_merge(['type' => $type], $attrs));
    }

    // ── Orders ────────────────────────────────────────────────────────────────

    protected function makeOrder(Customer|User|null $owner = null, array $attrs = []): Order
    {
        $owner ??= $this->makeCustomer();

        $ownerKey = $owner instanceof Customer ? 'customer_id' : 'user_id';

        return Order::factory()->create(array_merge(
            [$ownerKey => $owner->id],
            $attrs,
        ));
    }

    protected function makePaidOrder(Customer|User|null $owner = null, array $attrs = []): Order
    {
        return $this->makeOrder($owner, array_merge(['status' => 'paid', 'paid_at' => now()], $attrs));
    }

    /**
     * @param  array<string, mixed>  $attrs
     * @return array{card: GiftCard, code: string}
     */
    protected function makeGiftCard(array $attrs = [], ?string $plainCode = null): array
    {
        $service = app(GiftCardCodeService::class);
        $plain = $plainCode ?? $service->generate()['plain'];

        $card = GiftCard::create(array_merge([
            'code_hash' => $service->hash($plain),
            'code_last4' => $service->last4($plain),
            'initial_balance' => 50,
            'current_balance' => 50,
            'status' => 'active',
        ], $attrs));

        return ['card' => $card, 'code' => $plain];
    }

    // ── Auth headers ──────────────────────────────────────────────────────────

    protected function staffHeaders(User $user): array
    {
        $token = $user->createToken('test', ['staff'])->plainTextToken;

        return ['Authorization' => "Bearer {$token}"];
    }

    protected function customerHeaders(Customer $customer): array
    {
        $token = $customer->createToken('test', ['customer'])->plainTextToken;

        return ['Authorization' => "Bearer {$token}"];
    }
}
