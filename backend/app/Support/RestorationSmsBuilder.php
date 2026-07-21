<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\ServiceIncident;

/**
 * Builds the restoration SMS body for a single restore notification
 * (plan §14 / Stage 6).
 *
 * Config keys (config/service_availability.php → `restoration_sms`):
 *   default_template:     'Bake & Grill: :label is back — order now :url. Reply STOP to opt out.'
 *   templates.<key>:      Optional per-service override
 *   link:                 Public link to open (defaults to https://bakeandgrill.mv/order/menu)
 *
 * Kept small so the copy stays owner-editable via config without touching
 * the job. If templates blow past GSM-7 the SmsService will detect Unicode
 * and count segments correctly.
 */
class RestorationSmsBuilder
{
    public function build(string $serviceKey, ?ServiceIncident $incident = null): string
    {
        $config = config('service_availability.restoration_sms', []);
        $templates = $config['templates'] ?? [];
        $template = (string) ($templates[$serviceKey] ?? $config['default_template'] ?? 'Bake & Grill: :label is back. :url');

        $label = (string) config("service_availability.keys.$serviceKey.label", $serviceKey);
        $url = (string) ($config['link'] ?? url('/'));

        $replacements = [
            ':label' => $label,
            ':service_key' => $serviceKey,
            ':url' => $url,
            ':incident_id' => (string) ($incident?->id ?? ''),
        ];

        return trim(strtr($template, $replacements));
    }
}
