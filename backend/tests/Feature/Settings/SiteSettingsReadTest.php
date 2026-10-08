<?php

declare(strict_types=1);

namespace Tests\Feature\Settings;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The read behind the settings.update screens.
 *
 * Manager walk, 2026-10-08: the write took settings.update but the read wanted
 * website.manage, so a manager's Credit accounts, Refunds & payouts,
 * Notifications, Online ordering and SMS automations screens loaded nothing,
 * showed their defaults ("Open", a blank limit), and Save wrote those over the
 * owner's settings.
 */
class SiteSettingsReadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        SiteSetting::set('credit_accounts_mode', 'closed');
        SiteSetting::set('credit_limit_max_mvr', '7000');
        SiteSetting::set('online_ordering_schedule', '{"mon":"08:00-22:00"}');
        SiteSetting::set('announcement_text', 'Website copy');
    }

    /** @return array<string, mixed> */
    private function readAs(User $user): array
    {
        Sanctum::actingAs($user, ['staff']);
        $res = $this->getJson('/api/site-settings')->assertOk();

        $seen = [];
        foreach ((array) $res->json('settings') as $group) {
            foreach ((array) $group as $row) {
                $seen[$row['key']] = $row['value'];
            }
        }

        return $seen;
    }

    public function test_a_manager_reads_the_settings_their_screens_save(): void
    {
        $seen = $this->readAs($this->makeManager());

        $this->assertSame('closed', $seen['credit_accounts_mode'] ?? null);
        $this->assertSame('7000', $seen['credit_limit_max_mvr'] ?? null);
        $this->assertArrayHasKey('online_ordering_schedule', $seen, 'Online Ordering shows the schedule beside what it saves.');
        // Website copy stays with website.manage.
        $this->assertArrayNotHasKey('announcement_text', $seen);
    }

    public function test_an_owner_still_reads_everything(): void
    {
        $seen = $this->readAs($this->makeOwner());

        $this->assertSame('closed', $seen['credit_accounts_mode'] ?? null);
        $this->assertSame('Website copy', $seen['announcement_text'] ?? null);
    }

    public function test_a_cashier_cannot_read(): void
    {
        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);

        $this->getJson('/api/site-settings')->assertForbidden();
    }
}
