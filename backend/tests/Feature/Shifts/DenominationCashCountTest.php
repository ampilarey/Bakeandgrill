<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Shifts\CashDenominationCatalog;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use App\Support\LaariConverter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DenominationCashCountTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Shift $shift;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(['slug' => 'cashier'], ['name' => 'Cashier', 'description' => '', 'is_active' => true]);
        $this->cashier = User::create([
            'name' => 'Denom Cashier',
            'email' => 'denom-cashier@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->cashier->grantPermission('pos.ring_sales');
        $this->cashier->grantPermission('pos.close_shift');
        $this->cashier->grantPermission('shifts.view_own_history');

        $this->shift = Shift::create([
            'user_id' => $this->cashier->id,
            'opened_at' => now()->subHours(4),
            'opening_cash' => 100,
        ]);

        Sanctum::actingAs($this->cashier, ['staff']);
    }

    public function test_denomination_close_persists_breakdown_and_computes_total_in_laari(): void
    {
        // Expected = opening 100 (no sales). Count: 1×100 + 1×0.25 = 100.25
        $res = $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => [
                '10000' => 1,
                '25' => 1,
            ],
            'notes' => 'Short coins',
        ])->assertOk();

        $this->shift->refresh();
        $this->assertSame(CashDenominationCatalog::METHOD_DENOMINATIONS, $this->shift->cash_count_method);
        $this->assertSame(['10000' => 1, '25' => 1], $this->shift->cash_count_breakdown);
        $this->assertSame(10025, LaariConverter::toLaar($this->shift->closing_cash));
        $this->assertSame(10025, (int) round((float) $this->shift->closing_cash * 100));
        $this->assertEqualsWithDelta(0.25, (float) $this->shift->variance, 0.001);
        $this->assertEqualsWithDelta(100.25, (float) $res->json('shift.closing_cash'), 0.001);
    }

    public function test_empty_denomination_boxes_count_as_zero_and_still_close(): void
    {
        // All empty → counted 0; variance vs expected 100 requires a note.
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => [],
            'notes' => 'Drawer empty — robbery?',
        ])->assertOk();

        $this->shift->refresh();
        $this->assertSame([], $this->shift->cash_count_breakdown ?? []);
        $this->assertEqualsWithDelta(0.0, (float) $this->shift->closing_cash, 0.001);
        $this->assertEqualsWithDelta(-100.0, (float) $this->shift->variance, 0.001);
    }

    public function test_non_zero_variance_still_requires_reason(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['10000' => 1], // 100 — matches expected; no note needed
        ])->assertOk();
    }

    public function test_variance_reason_required_when_denomination_total_mismatches(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['50000' => 1], // 500 vs expected 100
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Notes are required when cash variance is not zero.');
    }

    public function test_plain_total_fallback_records_method(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_PLAIN_TOTAL,
            'closing_cash' => 100,
        ])->assertOk();

        $this->shift->refresh();
        $this->assertSame(CashDenominationCatalog::METHOD_PLAIN_TOTAL, $this->shift->cash_count_method);
        $this->assertNull($this->shift->cash_count_breakdown);
        $this->assertEqualsWithDelta(100.0, (float) $this->shift->closing_cash, 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $this->shift->variance, 0.001);
    }

    public function test_legacy_close_without_method_still_works(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'closing_cash' => 100,
        ])->assertOk();

        $this->shift->refresh();
        $this->assertSame(CashDenominationCatalog::METHOD_PLAIN_TOTAL, $this->shift->cash_count_method);
    }

    public function test_foreign_currency_is_recorded_but_does_not_alter_variance(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => [
                // Count only MVR 50 → short 50 vs expected 100
                '5000' => 1,
            ],
            'foreign_currency' => [
                [
                    'currency' => 'USD',
                    'denomination' => 50,
                    'count' => 1,
                    'accepted_mvr' => 770,
                ],
            ],
            'notes' => 'USD 50 in drawer — short MVR',
        ])->assertOk();

        $this->shift->refresh();
        $this->assertEqualsWithDelta(50.0, (float) $this->shift->closing_cash, 0.001);
        $this->assertEqualsWithDelta(-50.0, (float) $this->shift->variance, 0.001);
        $this->assertEqualsWithDelta(100.0, (float) $this->shift->expected_cash, 0.001);

        $fx = $this->shift->foreign_currency_held;
        $this->assertIsArray($fx);
        $this->assertCount(1, $fx);
        $this->assertSame('USD', $fx[0]['currency']);
        $this->assertSame(1, $fx[0]['count']);
        $this->assertSame(77000, $fx[0]['accepted_mvr_laari']);
        $this->assertEqualsWithDelta(770.0, (float) $fx[0]['accepted_mvr'], 0.001);
    }

    public function test_history_returns_breakdown_and_foreign_currency(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['10000' => 1],
            'foreign_currency' => [
                ['currency' => 'USD', 'denomination' => 20, 'count' => 1, 'accepted_mvr' => 300],
            ],
        ])->assertOk();

        $this->getJson('/api/shifts/history')
            ->assertOk()
            ->assertJsonPath('shifts.0.id', $this->shift->id)
            ->assertJsonPath('shifts.0.cash_count_method', 'denominations')
            ->assertJsonPath('shifts.0.cash_count_breakdown.10000', 1)
            ->assertJsonPath('shifts.0.foreign_currency_held.0.currency', 'USD');
    }

    public function test_daily_summary_includes_foreign_currency_held(): void
    {
        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-fx@test.com',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('9999'),
            'is_active' => true,
        ]);
        $owner->grantPermission('reports.financial');

        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_PLAIN_TOTAL,
            'closing_cash' => 90,
            'foreign_currency' => [
                ['currency' => 'USD', 'denomination' => 10, 'count' => 1, 'accepted_mvr' => 150],
            ],
            'notes' => 'USD ten',
        ])->assertOk();

        Sanctum::actingAs($owner, ['staff']);
        $this->getJson('/api/reports/finance/daily-summary?date='.now()->toDateString())
            ->assertOk()
            ->assertJsonPath('foreign_currency_held.0.currency', 'USD')
            ->assertJsonPath('foreign_currency_held.0.shift_id', $this->shift->id)
            ->assertJsonPath('foreign_currency_held.0.accepted_mvr', 150);
    }
}
