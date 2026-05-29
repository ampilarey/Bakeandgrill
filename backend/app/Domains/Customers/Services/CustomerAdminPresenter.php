<?php

declare(strict_types=1);

namespace App\Domains\Customers\Services;

use App\Models\Customer;

final class CustomerAdminPresenter
{
    public static function format(Customer $c): array
    {
        return [
            'id' => $c->id,
            'name' => $c->name,
            'phone' => $c->phone,
            'email' => $c->email,
            'tier' => $c->tier,
            'loyalty_points' => $c->loyalty_points,
            'is_active' => (bool) $c->is_active,
            'is_profile_complete' => (bool) $c->is_profile_complete,
            'sms_opt_out' => (bool) $c->sms_opt_out,
            'internal_notes' => $c->internal_notes,
            'preferred_language' => $c->preferred_language,
            'orders_count' => $c->orders_count ?? 0,
            'last_login_at' => $c->last_login_at,
            'last_order_at' => $c->last_order_at,
            'created_at' => $c->created_at,
            'credit_enabled' => (bool) ($c->credit_enabled ?? false),
            'credit_status' => $c->credit_status ?? 'blocked',
            'credit_limit_laar' => (int) ($c->credit_limit_laar ?? 0),
            'credit_balance_laar' => (int) ($c->credit_balance_laar ?? 0),
        ];
    }
}
