<?php

declare(strict_types=1);

namespace Tests\Feature\Marketing;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class TierMilestoneSmsTest extends TestCase
{
    use RefreshDatabase;

    public function test_tier_milestone_command_skips_when_disabled(): void
    {
        SiteSetting::set('marketing_tier_milestone_enabled', '0');

        Artisan::call('marketing:send-tier-milestones');

        $this->assertStringContainsString('disabled', Artisan::output());
    }

    public function test_tier_milestone_settings_api(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        $this->patchJson('/api/admin/marketing/automation', [
            'tier_milestone_enabled' => true,
            'tier_milestone_within' => 75,
            'tier_milestone_sms_template' => 'Almost there: {points_left} pts to {next_tier}. {url}',
        ])
            ->assertOk()
            ->assertJsonPath('settings.tier_milestone_enabled', true)
            ->assertJsonPath('settings.tier_milestone_within', 75);
    }
}
