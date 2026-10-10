<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

use App\Domains\Notifications\Support\AlertAudience;
use App\Models\CateringRequest;
use App\Models\User;

/**
 * Who the catering staff alerts go to (re-audit, 2026-10-10): each alert's
 * audience on its row in Admin → Notifications. By default a new request
 * goes to everyone who manages catering (events.manage); from then on to
 * the person handling it, or to everyone until someone does. The owner can
 * add roles, people, numbers or email addresses on the row, or except
 * someone. The old "catering notify phone / email" fallback on Settings →
 * Ordering is gone: the migration moved it onto the five rows.
 *
 * Addresses are what SmsService takes: a phone, "user:{id}" for a person
 * without one (reached by email or Telegram), "email:{address}" for a
 * typed address.
 */
class CateringNotifyRecipients
{
    public const TYPE_CREATED = 'catering_request_staff';

    /** The five catering staff alerts, each with its own audience. */
    public const ALL_STAFF_TYPES = [
        'catering_request_staff', 'catering_quote_staff', 'catering_confirmed_staff',
        'catering_reminder_staff', 'catering_lifecycle_staff',
    ];

    /**
     * A new request: nobody handles it yet.
     *
     * @return list<string>
     */
    public function forCreated(): array
    {
        return AlertAudience::addresses(self::TYPE_CREATED)->all();
    }

    /**
     * Lifecycle notifications after ownership applies (quote sent, confirmed, etc.).
     *
     * @return list<string>
     */
    public function forLifecycle(CateringRequest $request, string $type = 'catering_lifecycle_staff'): array
    {
        return AlertAudience::addresses($type, ['handler' => $request->handled_by !== null ? (int) $request->handled_by : null])->all();
    }

    /**
     * Active staff holding events.manage (for assignee dropdown).
     *
     * @return list<array{id:int,name:string,phone:?string,email:?string}>
     */
    public function eventsManageStaff(): array
    {
        return User::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->filter(fn (User $u) => $u->hasPermission('events.manage'))
            ->map(fn (User $u) => [
                'id' => $u->id,
                'name' => (string) ($u->name ?: ('Staff #' . $u->id)),
                'phone' => $u->phone,
                'email' => $u->email,
            ])
            ->values()
            ->all();
    }
}
