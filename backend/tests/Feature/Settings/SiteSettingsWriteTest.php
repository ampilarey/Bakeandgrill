<?php

declare(strict_types=1);

namespace Tests\Feature\Settings;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Http\Controllers\Api\SiteSettingsController;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The generic settings write, restored narrow.
 *
 * Purchasing settings audit, 2026-09-05: five admin screens saved through
 * `PUT /api/site-settings`, and the route had been retired three weeks
 * earlier — every Save on Stock Corrections, Credit Accounts, Ordering
 * Control and both SMS switch pages returned 405. These tests hold the route
 * to its new shape: an explicit list of keys, refused by name otherwise, and
 * a parity check against the admin source so the list cannot fall behind the
 * screens again.
 */
class SiteSettingsWriteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    public function test_an_owner_can_save_an_allowlisted_key(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->putJson('/api/site-settings', ['settings' => ['stock_variance_reason_mvr' => '250']])
            ->assertOk()
            ->assertJsonPath('settings.stock_variance_reason_mvr', '250');

        $this->assertSame('250', SiteSetting::get('stock_variance_reason_mvr'));
    }

    public function test_a_manager_holding_settings_update_alone_can_save(): void
    {
        /*
         * The screens that save here are settings.update pages. Gating the
         * write on website.manage — as the read is — would let a manager open
         * Stock Corrections and then refuse the Save button.
         */
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $this->putJson('/api/site-settings', ['settings' => ['credit_limit_max_mvr' => '5000']])
            ->assertOk();

        $this->assertSame('5000', SiteSetting::get('credit_limit_max_mvr'));
    }

    public function test_a_cashier_cannot(): void
    {
        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);

        $this->putJson('/api/site-settings', ['settings' => ['credit_limit_max_mvr' => '5000']])
            ->assertForbidden();
    }

    public function test_a_key_nobody_listed_is_refused_by_name(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $res = $this->putJson('/api/site-settings', ['settings' => ['app_debug' => 'true']])
            ->assertStatus(422);

        $this->assertStringContainsString('app_debug', (string) $res->json('errors.settings.0'));
        $this->assertNull(SiteSetting::get('app_debug'));
    }

    public function test_one_bad_key_means_nothing_is_written(): void
    {
        // Half a save is worse than no save: the screen would show success on
        // some fields and the owner would not know which.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        SiteSetting::set('pickup_slot_minutes', '15');

        $this->putJson('/api/site-settings', ['settings' => [
            'pickup_slot_minutes' => '30',
            'announcement_text' => 'sneaked in',
        ]])->assertStatus(422);

        $this->assertSame('15', SiteSetting::get('pickup_slot_minutes'));
        $this->assertNull(SiteSetting::get('announcement_text'));
    }

    public function test_a_null_clears_the_setting(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        SiteSetting::set('catering_notify_email', 'old@example.com');

        $this->putJson('/api/site-settings', ['settings' => ['catering_notify_email' => null]])
            ->assertOk();

        $this->assertSame('', (string) SiteSetting::get('catering_notify_email'));
    }

    public function test_every_key_the_admin_sends_is_on_the_list(): void
    {
        /*
         * The bug this route came back from: a screen sending a key the
         * backend will not take. This reads the admin source the same way the
         * audit did — every literal inside an `updateSiteSettings({...})`
         * call, plus every `key: '...'` entry in a file that calls it with a
         * computed key — and fails naming any key the allowlist lacks.
         */
        $src = dirname(__DIR__, 3) . '/apps/admin-dashboard/src/pages';
        if (!is_dir($src)) {
            $this->markTestSkipped('Admin source not present alongside the backend.');
        }

        $sent = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($src, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'tsx') {
                continue;
            }
            $code = (string) file_get_contents($file->getPathname());
            if (!str_contains($code, 'updateSiteSettings')) {
                continue;
            }
            if (preg_match_all('/updateSiteSettings\(\s*\{(.*?)\}\s*\)/s', $code, $calls)) {
                foreach ($calls[1] as $body) {
                    if (preg_match_all('/\b([a-z][a-z0-9_]+)\s*:/', $body, $m)) {
                        array_push($sent, ...$m[1]);
                    }
                }
            }
            if (preg_match('/updateSiteSettings\(\s*\{\s*\[/', $code)
                && preg_match_all("/\bkey:\s*'([a-z0-9_]+)'/", $code, $m)) {
                array_push($sent, ...$m[1]);
            }
        }
        $sent = array_values(array_unique($sent));
        $this->assertNotEmpty($sent, 'Expected the admin to save at least one key through updateSiteSettings.');

        $missing = array_values(array_diff($sent, SiteSettingsController::WRITABLE_KEYS));
        $this->assertSame(
            [],
            $missing,
            'The admin sends these keys to PUT /api/site-settings but SiteSettingsController::WRITABLE_KEYS '
            . 'does not list them — every Save on that screen will fail: ' . implode(', ', $missing),
        );
    }
}
