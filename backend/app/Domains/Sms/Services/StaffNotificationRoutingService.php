<?php

declare(strict_types=1);

namespace App\Domains\Sms\Services;

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
 * Priority:
 *   1. Staff on shift that match order type + menu group filters
 *   2. Active external SmsContacts that match order type + time window
 *   3. Fallback staff (is_fallback=true) if nobody else matched
 */
class StaffNotificationRoutingService
{
    public function __construct(
        private readonly StaffScheduleResolver $scheduleResolver,
    ) {}

    /**
     * @return Collection<int, array{phone: string, recipient_type: string, recipient_id: int|null, fallback_used: bool}>
     */
    public function resolve(Order $order, string $eventType, Carbon $at): Collection
    {
        $recipients = collect();

        // 1. Staff recipients: on shift + prefs match
        $staffRecipients = $this->resolveStaffRecipients($order, $at);
        $recipients = $recipients->merge($staffRecipients);

        // 2. External SmsContact recipients: active window + order type match
        $externalRecipients = $this->resolveExternalContacts($order, $at);
        $recipients = $recipients->merge($externalRecipients);

        // Deduplicate by phone
        $recipients = $recipients->unique('phone')->values();

        // 3. If nobody matched, fall back
        if ($recipients->isEmpty()) {
            $fallback = $this->resolveFallback($order);
            if ($fallback->isNotEmpty()) {
                Log::info('StaffNotificationRouting: using fallback recipients', [
                    'order_id'   => $order->id,
                    'event_type' => $eventType,
                    'count'      => $fallback->count(),
                ]);

                return $fallback;
            }
        }

        return $recipients;
    }

    private function resolveStaffRecipients(Order $order, Carbon $at): Collection
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

        return $onShift->filter(function (User $user) use ($prefs, $order, $menuGroupIds) {
            // No phone configured — cannot receive SMS
            if (! $user->phone) {
                return false;
            }

            $pref = $prefs->get($user->id);

            // No pref record means default: receive everything
            if (! $pref) {
                return true;
            }

            if (! $pref->notifications_enabled) {
                return false;
            }

            if (! $pref->acceptsOrderType($order->type)) {
                return false;
            }

            if (! empty($menuGroupIds) && ! $pref->acceptsMenuGroups($menuGroupIds)) {
                return false;
            }

            return true;
        })->map(fn (User $user) => [
            'phone'          => $user->phone,
            'recipient_type' => 'staff',
            'recipient_id'   => $user->id,
            'fallback_used'  => false,
        ])->values();
    }

    private function resolveExternalContacts(Order $order, Carbon $at): Collection
    {
        return SmsContact::where('type', 'external')
            ->where('is_enabled', true)
            ->get()
            ->filter(function (SmsContact $contact) use ($order, $at) {
                if (! $contact->isActiveAt($at)) {
                    return false;
                }

                // If the contact has tags that include order type filtering
                if (! empty($contact->tags)) {
                    $orderTypes = array_filter(
                        $contact->tags,
                        fn ($t) => in_array($t, ['dine_in', 'takeaway', 'online_pickup', 'delivery'], true)
                    );
                    if (! empty($orderTypes) && ! in_array($order->type, $orderTypes, true)) {
                        return false;
                    }
                }

                return true;
            })
            ->map(fn (SmsContact $contact) => [
                'phone'          => $contact->resolvedPhone(),
                'recipient_type' => 'contact',
                'recipient_id'   => $contact->id,
                'fallback_used'  => false,
            ])
            ->filter(fn ($r) => ! empty($r['phone']))
            ->values();
    }

    private function resolveFallback(Order $order): Collection
    {
        $fallbackPrefs = StaffNotificationPref::where('is_fallback', true)
            ->orderBy('fallback_priority', 'desc')
            ->with('user')
            ->get();

        return $fallbackPrefs
            ->filter(fn ($pref) => $pref->user && $pref->user->phone && $pref->user->is_active)
            ->map(fn ($pref) => [
                'phone'          => $pref->user->phone,
                'recipient_type' => 'fallback',
                'recipient_id'   => $pref->user_id,
                'fallback_used'  => true,
            ])
            ->values();
    }

    private function extractMenuGroupIds(Order $order): array
    {
        // Eager load if not already loaded
        if (! $order->relationLoaded('items')) {
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
