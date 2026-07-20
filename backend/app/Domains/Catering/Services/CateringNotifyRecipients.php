<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

use App\Models\CateringRequest;
use App\Models\SiteSetting;
use App\Models\User;

/**
 * Handler-aware staff notification targets for catering/events.
 *
 * - Created / unassigned: all active events.manage holders + settings fallback
 * - Assigned lifecycle: handler + settings fallback only
 */
class CateringNotifyRecipients
{
    /**
     * @return list<array{phone:?string,email:?string,source:string,user_id?:int}>
     */
    public function forCreated(): array
    {
        return $this->mergeUnique(
            $this->fromEventsManagePermission(),
            $this->fromSettingsFallback(),
        );
    }

    /**
     * Lifecycle notifications after ownership applies (quote sent, confirmed, etc.).
     *
     * @return list<array{phone:?string,email:?string,source:string,user_id?:int}>
     */
    public function forLifecycle(CateringRequest $request): array
    {
        if ($request->handled_by === null) {
            return $this->forCreated();
        }

        $handler = User::query()->find($request->handled_by);
        $handlerTargets = [];
        if ($handler && $handler->is_active) {
            $phone = trim((string) ($handler->phone ?? ''));
            $email = trim((string) ($handler->email ?? ''));
            if ($phone !== '' || $email !== '') {
                $handlerTargets[] = [
                    'phone' => $phone !== '' ? $phone : null,
                    'email' => $email !== '' ? $email : null,
                    'source' => 'handler',
                    'user_id' => $handler->id,
                ];
            }
        }

        return $this->mergeUnique($handlerTargets, $this->fromSettingsFallback());
    }

    /**
     * @return list<array{phone:?string,email:?string,source:string,user_id?:int}>
     */
    public function fromSettingsFallback(): array
    {
        $phone = trim((string) SiteSetting::get('catering_notify_phone', ''));
        $email = trim((string) SiteSetting::get('catering_notify_email', ''));

        if ($phone === '' && $email === '') {
            return [];
        }

        return [[
            'phone' => $phone !== '' ? $phone : null,
            'email' => $email !== '' ? $email : null,
            'source' => 'settings',
        ]];
    }

    /**
     * @return list<array{phone:?string,email:?string,source:string,user_id?:int}>
     */
    public function fromEventsManagePermission(): array
    {
        $out = [];
        $users = User::query()
            ->where('is_active', true)
            ->orderBy('id')
            ->get();

        foreach ($users as $user) {
            if (!$user->hasPermission('events.manage')) {
                continue;
            }
            $phone = trim((string) ($user->phone ?? ''));
            $email = trim((string) ($user->email ?? ''));
            if ($phone === '' && $email === '') {
                continue;
            }
            $out[] = [
                'phone' => $phone !== '' ? $phone : null,
                'email' => $email !== '' ? $email : null,
                'source' => 'events.manage',
                'user_id' => $user->id,
            ];
        }

        return $out;
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

    /**
     * @param  list<array{phone:?string,email:?string,source:string,user_id?:int}>  ...$groups
     * @return list<array{phone:?string,email:?string,source:string,user_id?:int}>
     */
    private function mergeUnique(array ...$groups): array
    {
        $seen = [];
        $out = [];
        foreach ($groups as $group) {
            foreach ($group as $row) {
                $key = ($row['user_id'] ?? '') . '|' . ($row['phone'] ?? '') . '|' . ($row['email'] ?? '');
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $out[] = $row;
            }
        }

        return $out;
    }
}
