<?php

declare(strict_types=1);

namespace App\Domains\Orders\Support;

use App\Domains\Permissions\PermissionCatalog;
use App\Models\User;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Which order types a staff member may ring (owner, 2026-10-07: "Set
 * permission settings so i can turn off each type for all, for example
 * pick up and delivery turns off for staffs and on for a specific staff
 * only. I need full control").
 *
 * One permission per type (PermissionCatalog::ORDER_TYPE_PERMISSIONS), set
 * per role in Admin → Roles & Permissions and per person on their staff
 * page. Checked when a staff member creates an order or switches an
 * existing one to another type. Customers ordering online are not staff
 * and are not affected; editing an order already of that type is allowed.
 */
final class PosOrderTypeGate
{
    private const LABELS = [
        'dine_in' => 'Dine-in',
        'takeaway' => 'Takeaway',
        'online_pickup' => 'Pickup',
        'delivery' => 'Delivery',
    ];

    public static function allows(mixed $actor, string $type): bool
    {
        if (!$actor instanceof User) {
            return true;
        }
        $slug = PermissionCatalog::ORDER_TYPE_PERMISSIONS[$type] ?? null;

        return $slug === null || $actor->hasPermission($slug);
    }

    public static function message(string $type): string
    {
        $label = self::LABELS[$type] ?? $type;

        return "You are not allowed to ring {$label} orders. Ask the owner to allow it in Admin → Staff.";
    }

    /** @throws HttpException 403 */
    public static function assert(mixed $actor, string $type): void
    {
        if (!self::allows($actor, $type)) {
            throw new HttpException(403, self::message($type));
        }
    }
}
