<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

/**
 * Resolves staff notification targets for catering/event requests.
 *
 * Phase 2: site-setting fallbacks only.
 * Phase 3: plug in events.manage holders (+ handler-aware rules).
 */
class CateringNotifyRecipients
{
    /**
     * @return list<array{phone:?string,email:?string,source:string}>
     */
    public function forCreated(): array
    {
        return $this->fromSettingsFallback();
    }

    /**
     * @return list<array{phone:?string,email:?string,source:string}>
     */
    public function fromSettingsFallback(): array
    {
        $phone = trim((string) \App\Models\SiteSetting::get('catering_notify_phone', ''));
        $email = trim((string) \App\Models\SiteSetting::get('catering_notify_email', ''));

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
     * Phase 3 hook — return users holding events.manage.
     * Currently unused; kept so Phase 3 can replace fromSettingsFallback callers.
     *
     * @return list<array{phone:?string,email:?string,source:string}>
     */
    public function fromEventsManagePermission(): array
    {
        // Intentionally empty until Phase 3 seeds events.manage.
        return [];
    }
}
