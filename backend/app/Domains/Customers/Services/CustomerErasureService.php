<?php

declare(strict_types=1);

namespace App\Domains\Customers\Services;

use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\CustomerDepositAccount;
use App\Models\Order;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Erase a customer's personal data on request (security and data protection
 * audit, 2026-10-01).
 *
 * The privacy page promises "request data correction or deletion", but
 * Delete only hid the row: name, phone, email, birthday, saved addresses and
 * every delivery address and contact number on past orders stayed forever.
 *
 * This keeps what the business must keep (orders, payments, invoices and GST
 * records, by number and amount) and removes what identifies the person: the
 * profile, saved addresses, and the delivery contact details on finished
 * orders. It refuses while there is money between the two sides (credit owed,
 * a deposit balance) or an order still open, because those need a name to
 * settle.
 */
final class CustomerErasureService
{
    private const OPEN_STATUSES = ['pending', 'payment_pending', 'partial', 'held', 'confirmed', 'in_progress', 'preparing', 'ready', 'out_for_delivery', 'on_the_way'];

    public function __construct(private readonly AuditLogService $audit) {}

    /** @return list<string> reasons erasure cannot go ahead yet; empty when it can */
    public function blockers(Customer $customer): array
    {
        $reasons = [];
        if ((int) ($customer->credit_balance_laar ?? 0) > 0) {
            $reasons[] = sprintf('They owe MVR %s on credit.', number_format(((int) $customer->credit_balance_laar) / 100, 2));
        }
        $deposit = (int) CustomerDepositAccount::query()->where('customer_id', $customer->id)->value('balance_laar');
        if ($deposit > 0) {
            $reasons[] = sprintf('They have MVR %s on deposit. Pay it out first.', number_format($deposit / 100, 2));
        }
        if (Order::query()->where('customer_id', $customer->id)->whereIn('status', self::OPEN_STATUSES)->exists()) {
            $reasons[] = 'They have an order that is still open.';
        }

        return $reasons;
    }

    public function erase(Customer $customer, User $actor, ?Request $request = null): Customer
    {
        $blockers = $this->blockers($customer);
        if ($blockers !== []) {
            abort(422, 'Cannot erase yet: ' . implode(' ', $blockers));
        }

        return DB::transaction(function () use ($customer, $actor, $request): Customer {
            $id = (int) $customer->id;

            $scrubbedOrders = Order::query()->where('customer_id', $id)->update([
                'delivery_address_line1' => null,
                'delivery_address_line2' => null,
                'delivery_contact_name' => null,
                'delivery_contact_phone' => null,
                'delivery_notes' => null,
                'delivery_location_link' => null,
                'customer_notes' => null,
            ]);
            $addresses = CustomerAddress::query()->where('customer_id', $id)->delete();
            $customer->tokens()->delete();

            $customer->forceFill([
                'name' => 'Erased customer #' . $id,
                'phone' => 'erased-' . $id,
                'email' => null,
                'tin' => null,
                'billing_address' => null,
                'date_of_birth' => null,
                'preferences' => null,
                'internal_notes' => null,
                'delivery_address' => null,
                'delivery_area' => null,
                'delivery_building' => null,
                'delivery_floor' => null,
                'delivery_notes' => null,
                'credit_notes' => null,
                'password' => null,
                'is_active' => false,
                'sms_opt_out' => true,
                'sms_opt_out_at' => now(),
                'sms_opt_out_source' => 'erased',
            ])->save();
            $customer->delete();

            // Nothing personal in the record of it: only that it happened.
            $this->audit->log('customer.erased', 'Customer', $id, [], [], [
                'orders_scrubbed' => $scrubbedOrders,
                'addresses_removed' => $addresses,
                'erased_by' => $actor->id,
            ], $request);

            return $customer;
        });
    }
}
