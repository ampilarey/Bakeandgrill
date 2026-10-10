<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Sms\Services\StaffScheduleResolver;
use App\Models\StaffNotificationPref;
use App\Models\TelegramLink;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Turns an AlertAudience into people. Loads the active staff once, so Admin
 * can describe fifty alerts with one query; a sender makes a fresh one per
 * alert and sees the staff as they are at that moment.
 */
final class AudienceResolver
{
    /** @var Collection<int, User>|null */
    private ?Collection $active = null;

    /** @var array<int, true>|null */
    private ?array $linked = null;

    /**
     * @param array{groups: list<string>, users: list<int>, except: list<int>, phones: list<string>, emails: list<string>} $audience
     * @param array{handler?: int|null, at?: Carbon|null, skip?: list<string>, except?: list<int>} $context
     * @return Collection<int, User>
     */
    public function usersFor(array $audience, array $context = []): Collection
    {
        $skip = $context['skip'] ?? [];
        $except = array_map('intval', [...$audience['except'], ...($context['except'] ?? [])]);
        $users = collect();
        foreach ($audience['groups'] as $group) {
            if (in_array($group, $skip, true)) {
                continue;
            }
            $users = $users->merge($this->groupUsers($group, $context));
        }
        if ($audience['users'] !== []) {
            $users = $users->merge($this->active()->whereIn('id', $audience['users']));
        }

        return $users->unique('id')
            ->reject(fn (User $u) => in_array((int) $u->id, $except, true))
            ->values();
    }

    /**
     * @param array{handler?: int|null, at?: Carbon|null} $context
     * @return Collection<int, User>
     */
    public function groupUsers(string $group, array $context = []): Collection
    {
        if (str_starts_with($group, 'role:')) {
            $slug = substr($group, 5);

            return $this->active()->filter(fn (User $u) => $u->role?->slug === $slug)->values();
        }
        if (str_starts_with($group, 'perm:')) {
            return $this->withPermission(substr($group, 5));
        }

        return match ($group) {
            AlertAudience::GROUP_ON_SHIFT => $this->onShift($context['at'] ?? null),
            AlertAudience::GROUP_CATERING_TEAM => $this->cateringTeam($context['handler'] ?? null),
            default => collect(), // the business phone is an address, not people
        };
    }

    /**
     * The channels that can reach this person today: their channels (own or
     * role) narrowed to a phone, a saved email, a linked Telegram.
     *
     * @return list<string>
     */
    public function reach(User $u): array
    {
        $allowed = NotificationChannels::forUser($u);
        $out = [];
        if (in_array(NotificationChannels::SMS, $allowed, true) && trim((string) $u->phone) !== '') {
            $out[] = NotificationChannels::SMS;
        }
        if (in_array(NotificationChannels::EMAIL, $allowed, true) && filter_var(trim((string) $u->email), FILTER_VALIDATE_EMAIL)) {
            $out[] = NotificationChannels::EMAIL;
        }
        if (in_array(NotificationChannels::TELEGRAM, $allowed, true) && isset($this->linked()[(int) $u->id])) {
            $out[] = NotificationChannels::TELEGRAM;
        }

        return $out;
    }

    /** @return Collection<int, User> */
    private function active(): Collection
    {
        return $this->active ??= User::query()
            ->where('is_active', true)
            ->with(['role', 'role.permissions', 'permissions'])
            ->orderBy('name')
            ->get();
    }

    /** @return array<int, true> */
    private function linked(): array
    {
        return $this->linked ??= TelegramLink::query()
            ->whereNotNull('user_id')
            ->whereNull('blocked_at')
            ->pluck('user_id')
            ->mapWithKeys(fn ($id) => [(int) $id => true])
            ->all();
    }

    /** @return Collection<int, User> */
    private function withPermission(string $slug): Collection
    {
        $perms = app(PermissionService::class);

        return $this->active()->filter(fn (User $u) => $perms->hasPermission($u, $slug))->values();
    }

    /** The staff on shift now whose own order-alert switch is on. */
    private function onShift(?Carbon $at): Collection
    {
        $ids = app(StaffScheduleResolver::class)->staffOnShiftAt($at ?? now())->pluck('id')->map(fn ($id) => (int) $id)->all();
        if ($ids === []) {
            return collect();
        }
        $off = StaffNotificationPref::query()->whereIn('user_id', $ids)->where('notifications_enabled', false)->pluck('user_id')->map(fn ($id) => (int) $id)->all();

        return $this->active()->whereIn('id', array_values(array_diff($ids, $off)))->values();
    }

    /** The person handling a catering request; everyone who manages catering until someone does. */
    private function cateringTeam(?int $handler): Collection
    {
        if ($handler !== null) {
            $person = $this->active()->firstWhere('id', $handler);
            if ($person !== null) {
                return collect([$person]);
            }
        }

        return $this->withPermission('events.manage');
    }
}
