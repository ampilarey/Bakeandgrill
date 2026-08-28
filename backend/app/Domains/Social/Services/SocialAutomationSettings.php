<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\SiteSetting;

/**
 * Daily-special automation settings (plan §2c "posting policy" + rollout
 * gate). SiteSetting-backed like the other ops toggles. `unattended` is the
 * pilot gate: off means the automation only DRAFTS a post (awaiting
 * approval); a human with social.publish sends it. Turn it on only after an
 * observed pilot period.
 */
class SocialAutomationSettings
{
    public const TEMPLATE_DEFAULT = "Today's special: {item} — MVR {price}\n{badge}\nOrder now: {link}";

    /** @return array{enabled: bool, time: string, channel_ids: list<int>, template: string, unattended: bool} */
    public function all(): array
    {
        $channelIds = json_decode((string) SiteSetting::get('social_auto_special_channel_ids', '[]'), true);

        return [
            'enabled' => filter_var(SiteSetting::get('social_auto_special_enabled', '0'), FILTER_VALIDATE_BOOLEAN),
            'time' => (string) SiteSetting::get('social_auto_special_time', '11:00'),
            'channel_ids' => is_array($channelIds) ? array_values(array_map('intval', $channelIds)) : [],
            'template' => (string) SiteSetting::get('social_auto_special_template', self::TEMPLATE_DEFAULT),
            'unattended' => filter_var(SiteSetting::get('social_auto_special_unattended', '0'), FILTER_VALIDATE_BOOLEAN),
        ];
    }

    /** @param array<string, mixed> $input */
    public function update(array $input): array
    {
        if (array_key_exists('enabled', $input)) {
            SiteSetting::set('social_auto_special_enabled', filter_var($input['enabled'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }
        if (array_key_exists('time', $input)) {
            SiteSetting::set('social_auto_special_time', (string) $input['time']);
        }
        if (array_key_exists('channel_ids', $input) && is_array($input['channel_ids'])) {
            SiteSetting::set('social_auto_special_channel_ids', json_encode(array_values(array_map('intval', $input['channel_ids']))));
        }
        if (array_key_exists('template', $input)) {
            SiteSetting::set('social_auto_special_template', (string) $input['template']);
        }
        if (array_key_exists('unattended', $input)) {
            SiteSetting::set('social_auto_special_unattended', filter_var($input['unattended'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }
        SiteSetting::bust();

        return $this->all();
    }
}
