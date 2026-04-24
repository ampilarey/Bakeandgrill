<?php

declare(strict_types=1);

namespace App\Domains\Sms\Services;

use App\Models\SmsContact;
use App\Models\SmsContactGroup;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class SmsContactResolver
{
    /**
     * Resolve the phone for a single contact at the given time.
     * Returns null if the contact is disabled or outside their active window.
     */
    public function resolveForContact(SmsContact $contact, Carbon $at): ?string
    {
        if (! $contact->isActiveAt($at)) {
            return null;
        }

        $phone = $contact->resolvedPhone();

        return $phone ?: null;
    }

    /**
     * Resolve all active phones for a group at the given time.
     * Returns a Collection of unique phone strings.
     */
    public function resolveForGroup(SmsContactGroup $group, Carbon $at): Collection
    {
        if (! $group->is_enabled) {
            return collect();
        }

        return $group->contacts()
            ->with('user')
            ->get()
            ->filter(fn (SmsContact $contact) => $contact->isActiveAt($at))
            ->map(fn (SmsContact $contact) => $contact->resolvedPhone())
            ->filter()
            ->unique()
            ->values();
    }

    /**
     * Resolve a list of phones from a scheduled message's recipient definition.
     */
    public function resolveForScheduledMessage(
        string $toType,
        ?SmsContact $contact,
        ?SmsContactGroup $group,
        ?string $rawPhone,
        Carbon $at,
    ): Collection {
        return match ($toType) {
            'contact' => $contact
                ? collect(array_filter([$this->resolveForContact($contact, $at)]))
                : collect(),
            'group' => $group
                ? $this->resolveForGroup($group, $at)
                : collect(),
            'phone' => $rawPhone
                ? collect([$rawPhone])
                : collect(),
            default => collect(),
        };
    }
}
