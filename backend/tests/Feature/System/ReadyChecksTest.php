<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Console\Commands\BackupRestoreDrill;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\System\ReadyChecks;
use App\Domains\System\RestoreDrill;
use App\Domains\System\Services\SchedulerRunTracker;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Is the site ready to run unattended (iruali import plan, feature 15): one
 * list for `app:ready` and System → Health, and the monthly restore drill.
 */
class ReadyChecksTest extends TestCase
{
    use RefreshDatabase;

    private string $drillFile = '';

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    protected function tearDown(): void
    {
        if ($this->drillFile !== '' && is_file($this->drillFile)) {
            @unlink($this->drillFile);
        }
        parent::tearDown();
    }

    /** @return array<string, array{status: string, detail: string, fix: string}> */
    private function checks(): array
    {
        $out = [];
        foreach (app(ReadyChecks::class)->run() as $c) {
            $out[$c['key']] = $c;
        }

        return $out;
    }

    public function test_every_check_reports_and_a_pass_carries_no_fix(): void
    {
        $checks = $this->checks();

        $this->assertSame(['database', 'redis', 'queue', 'scheduler', 'storage', 'debug', 'mail', 'bml', 'sms', 'backup', 'restore_drill', 'redis_separation'], array_keys($checks));
        foreach ($checks as $c) {
            $this->assertContains($c['status'], ['pass', 'warn', 'fail', 'skip']);
            $this->assertNotSame('', $c['detail']);
            if ($c['status'] === 'pass') {
                $this->assertSame('', $c['fix']);
            }
        }
        $this->assertSame('pass', $checks['database']['status']);
        $this->assertSame('skip', $checks['restore_drill']['status'], 'no drill yet');
    }

    public function test_missing_bml_keys_and_an_old_backup_are_named_with_the_fix(): void
    {
        config(['bml.api_key' => null, 'bml.app_id' => 'app']);
        app(SchedulerRunTracker::class)->recordLastRun('backup:run');
        $this->travel(30)->hours();

        $checks = $this->checks();

        $this->assertStringContainsString('BML_API_KEY', $checks['bml']['detail']);
        $this->assertNotSame('', $checks['bml']['fix']);
        $this->assertSame('fail', $checks['backup']['status']);
        $this->assertStringContainsString('30 hours old', $checks['backup']['detail']);
    }

    public function test_a_run_of_failed_texts_fails_the_sms_check(): void
    {
        config(['services.dhiraagu.api_url' => 'https://sms.test', 'services.dhiraagu.username' => 'u', 'services.dhiraagu.password' => 'p']);
        foreach (range(1, 6) as $i) {
            SmsLog::query()->forceCreate(['to' => '7771234', 'message' => 'x', 'type' => 'otp', 'status' => 'failed']);
        }

        $this->assertSame('fail', $this->checks()['sms']['status']);
    }

    public function test_app_ready_exits_one_on_a_fail(): void
    {
        SiteSetting::set(ReadyChecks::DRILL_SETTING, json_encode(['status' => 'fail', 'detail' => 'orders missing', 'at' => now()->toIso8601String()]));

        $this->assertSame(1, Artisan::call('app:ready'));
        $this->assertStringContainsString('orders missing', Artisan::output());
    }

    public function test_the_health_page_carries_the_list(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $res = $this->getJson('/api/admin/system/health/detailed')->assertOk();

        $this->assertSame('database', $res->json('ready.0.key'));
    }

    public function test_the_drill_is_skipped_without_a_drill_database_and_never_touches_live(): void
    {
        config(['system.restore_drill_database' => null]);
        $this->assertSame('skipped', app(RestoreDrill::class)->run()['status']);

        config(['system.restore_drill_database' => config('database.connections.' . config('database.default') . '.database')]);
        $result = app(RestoreDrill::class)->run();
        $this->assertSame('fail', $result['status']);
        $this->assertStringContainsString('live database', $result['detail']);
    }

    public function test_a_drill_restores_compares_empties_and_tells_the_owner(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        $this->makeItem(false, 0, ['name' => 'Bajiya']);
        $this->drillFile = tempnam(sys_get_temp_dir(), 'drill-db-');
        config(['system.restore_drill_database' => $this->drillFile]);
        // A drill that "restores" by copying the live tables into the drill file.
        $this->app->bind(RestoreDrill::class, fn () => new class extends RestoreDrill
        {
            protected function newestDump(): array
            {
                return ['Bake & Grill/2026-10-17.zip', 'unused'];
            }

            protected function restore(string $dump, string $database): void
            {
                foreach (self::TABLES as $table) {
                    if (!Schema::hasTable($table)) {
                        continue;
                    }
                    Schema::connection(self::CONNECTION)->create($table, fn ($t) => $t->id());
                    foreach (DB::table($table)->pluck('id') as $id) {
                        DB::connection(self::CONNECTION)->table($table)->insert(['id' => $id]);
                    }
                }
            }
        });

        $this->assertSame(0, Artisan::call('backup:restore-drill'));

        $last = json_decode((string) SiteSetting::get(ReadyChecks::DRILL_SETTING), true);
        $this->assertSame('pass', $last['status']);
        $items = \App\Models\Item::query()->count();
        $this->assertGreaterThan(0, $items);
        $this->assertSame(['live' => $items, 'restored' => $items], $last['tables']['items']);
        $this->assertSame('pass', $this->checks()['restore_drill']['status']);
        $this->assertSame([], Schema::connection(RestoreDrill::CONNECTION)->getTableListing(null, false), 'the drill database is emptied');
        $body = (string) SmsLog::query()->where('type', BackupRestoreDrill::TYPE)->value('message');
        $this->assertStringContainsString('backup drill passed', $body);
        $this->assertStringContainsString("items {$items}/{$items}", $body);
    }
}
