<?php

declare(strict_types=1);

namespace App\Domains\Sms\Services;

use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\NotificationChannels;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\Order;
use App\Models\SmsContact;
use App\Models\StaffNotificationPref;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Resolves which recipients should receive an SMS notification for a given order event.
 *
 * Who gets an order alert is the alert's audience (AlertAudience, Admin →
 * Notifications → the row's Edit; re-audit 2026-10-10):
 *   1. "Staff on shift" (the default): staff with a shift covering now whose
 *      own order-alert settings match (switch on, order type, station);
 *   2. the other groups and the named people on the row, on shift or not;
 *   3. typed numbers on the row;
 *   4. active external SmsContacts that match order type + time window
 *      (Notifications → People → Extra numbers);
 *   5. fallback staff (is_fallback=true) if nobody else matched.
 * Someone the row excepts never gets it, whichever list they are in.
 */
class StaffNotificationRoutingService
{
    public function __construct(
        private readonly StaffScheduleResolver $scheduleResolver,
    ) {}

    /** The row in Admin → Notifications an order event is. */
    public static function typeFor(string $eventType): string
    {
        return SmsTypeRegistry::get('staff_' . $eventType) !== null ? 'staff_' . $eventType : 'staff_notification';
    }

    /**
     * @return Collection<int, array{phone: string, recipient_type: string, recipient_id: int|null, fallback_used: bool}>
     */
    public function resolve(Order $order, string $eventType, Carbon $at): Collection
    {
        $type = self::typeFor($eventType);
        $audience = AlertAudience::for($type) ?? AlertAudience::normalize(['groups' => [AlertAudience::GROUP_ON_SHIFT]]);
        $except = $audience['except'];
        $recipients = collect();

        // 1. Staff on shift whose prefs match
        if (in_array(AlertAudience::GROUP_ON_SHIFT, $audience['groups'], true)) {
            $recipients = $recipients->merge($this->resolveStaffRecipients($order, $at, $except));
        }

        // 2. Everyone else the row names, on shift or not
        $named = AlertAudience::users($type, ['skip' => [AlertAudience::GROUP_ON_SHIFT], 'at' => $at])
            ->map(fn (User $user) => NotificationChannels::addressFor($user) === null ? null : [
                'phone' => NotificationChannels::addressFor($user),
                'recipient_type' => 'staff',
                'recipient_id' => (int) $user->id,
                'fallback_used' => false,
            ])
            ->filter()
            ->values();
        $recipients = $recipients->merge($named);

        // 3. Typed numbers, the shop phone and typed emails on the row
        $typed = AlertAudience::addresses($type, ['skip' => array_diff($audience['groups'], [AlertAudience::GROUP_BUSINESS_PHONE])])
            ->reject(fn (string $to) => $named->contains('phone', $to))
            ->map(fn (string $to) => ['phone' => $to, 'recipient_type' => 'contact', 'recipient_id' => null, 'fallback_used' => false]);
        $recipients = $recipients->merge($typed);

        // 4. External SmsContact recipients: active window + order type match
        $recipients = $recipients->merge($this->resolveExternalContacts($order, $at));

        // Deduplicate by address
        $recipients = $recipients->unique('phone')->values();

        // 5. If nobody matched, fall back
        if ($recipients->isEmpty()) {
            $fallback = $this->resolveFallback($order, $except);
            if ($fallback->isNotEmpty()) {
                Log::info('StaffNotificationRouting: using fallback recipients', [
                    'order_id' => $order->id,
                    'event_type' => $eventType,
                    'count' => $fallback->count(),
                ]);

                return $fallback;
            }
        }

        return $recipients;
    }

    /** @param list<int> $except */
    private function resolveStaffRecipients(Order $order, Carbon $at, array $except): Collection
    {
        // Get menu group IDs from the order's items
        $menuGroupIds = $this->extractMenuGroupIds($order);

        // Get all staff on shift right now
        $onShift = $this->scheduleResolver->staffOnShiftAt($at);

        if ($onShift->isEmpty()) {
            return collect();
        }

        // Load notification prefs for on-shift staff
        $userIds = $onShift->pluck('id')->all();
        $prefs = StaffNotificationPref::whereIn('user_id', $userIds)
            ->get()
            ->keyBy('user_id');

        return $onShift->filter(function (User $user) use ($prefs, $order, $menuGroupIds, $except) {
            // Excepted on the alert's row: never, whatever their own settings say.
            if (in_array((int) $user->id, $except, true) || !$user->is_active) {
                return false;
            }

            // No phone: email or Telegram instead, when either reaches them
            // (owner, 2026-10-10). Before, they got no order alerts at all.
            if (NotificationChannels::addressFor($user) === null) {
                return false;
            }

            $pref = $prefs->get($user->id);

            // No pref record means default: receive everything
            if (!$pref) {
                return true;
            }

            if (!$pref->notifications_enabled) {
                return false;
            }

            if (!$pref->acceptsOrderType($order->type)) {
                return false;
            }

            if (!empty($menuGroupIds) && !$pref->acceptsMenuGroups($menuGroupIds)) {
                return false;
            }

            return true;
        })->map(fn (User $user) => [
            'phone' => NotificationChannels::addressFor($user),
            'recipient_type' => 'staff',
            'recipient_id' => $user->id,
            'fallback_used' => false,
        ])->values();
    }

    private function resolveExternalContacts(Order $order, Carbon $at): Collection
    {
        return SmsContact::where('type', 'external')
            ->where('is_enabled', true)
            ->get()
            ->filter(function (SmsContact $contact) use ($order, $at) {
                if (!$contact->isActiveAt($at)) {
                    return false;
                }

                // If the contact has tags that include order type filtering
                if (!empty($contact->tags)) {
                    $orderTypes = array_filter(
                        $contact->tags,
                        fn ($t) => in_array($t, ['dine_in', 'takeaway', 'online_pickup', 'delivery'], true),
                    );
                    if (!empty($orderTypes) && !in_array($order->type, $orderTypes, true)) {
                        return false;
                    }
                }

                return true;
            })
            ->map(fn (SmsContact $contact) => [
                'phone' => $contact->resolvedPhone(),
                'recipient_type' => 'contact',
                'recipient_id' => $contact->id,
                'fallback_used' => false,
            ])
            ->filter(fn ($r) => !empty($r['phone']))
            ->values();
    }

    /** @param list<int> $except */
    private function resolveFallback(Order $order, array $except): Collection
    {
        $fallbackPrefs = StaffNotificationPref::where('is_fallback', true)
            ->orderBy('fallback_priority', 'desc')
            ->with('user')
            ->get();

        return $fallbackPrefs
            ->filter(fn ($pref) => $pref->user && $pref->user->is_active && !in_array((int) $pref->user_id, $except, true) && NotificationChannels::addressFor($pref->user) !== null)
            ->map(fn ($pref) => [
                'phone' => NotificationChannels::addressFor($pref->user),
                'recipient_type' => 'fallback',
                'recipient_id' => $pref->user_id,
                'fallback_used' => true,
            ])
            ->values();
    }

    private function extractMenuGroupIds(Order $order): array
    {
        // Eager load if not already loaded
        if (!$order->relationLoaded('items')) {
            $order->load('items.item');
        }

        return $order->items
            ->pluck('item.menu_group_id')
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
}
