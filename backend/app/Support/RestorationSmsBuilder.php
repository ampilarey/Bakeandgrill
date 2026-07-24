<?php

declare(strict_types=1);

namespace App\Support;

use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Models\ServiceIncident;

/**
 * Builds the restoration SMS body for a single restore notification
 * (plan §14 / Stage 6).
 *
 * Prefers the `service_restoration` SmsTemplate when set; otherwise uses
 * config/service_availability.php → `restoration_sms` (unchanged fallback).
 */
class RestorationSmsBuilder
{
    public function __construct(
        private readonly CustomerSmsMessageBuilder $messages,
    ) {}

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

        $fallback = trim(strtr($template, $replacements));

        return $this->messages->build(
            'service_restoration',
            [
                'label' => $label,
                'url' => $url,
                'service_key' => $serviceKey,
                'incident_id' => (string) ($incident?->id ?? ''),
            ],
            $fallback,
        );
    }
}
