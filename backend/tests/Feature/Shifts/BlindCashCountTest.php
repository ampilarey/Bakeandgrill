<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Shifts\CashDenominationCatalog;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\Shift;
use App\Models\ShiftCashCountAttempt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The blind count is only blind if the SERVER refuses to hand the cashier
 * the expected drawer total while the shift is open, and every count
 * (review or final) leaves an attempt row the owner can audit.
 */
class BlindCashCountTest extends TestCase
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
            'name' => 'Blind Cashier',
            'email' => 'blind-cashier@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->cashier->grantPermission('pos.ring_sales');
        $this->cashier->grantPermission('pos.close_shift');
        $this->cashier->grantPermission('shifts.view_own_history');

        // Expected = opening 100 (no sales).
        $this->shift = Shift::create([
            'user_id' => $this->cashier->id,
            'opened_at' => now()->subHours(4),
            'opening_cash' => 100,
        ]);

        Sanctum::actingAs($this->cashier, ['staff']);
    }

    public function test_cashier_open_shift_summary_omits_expected_cash(): void
    {
        $json = $this->getJson("/api/shifts/{$this->shift->id}/summary")
            ->assertOk()
            ->json();

        $this->assertArrayNotHasKey('expected_cash', $json['cash_drawer']);
        // Omitted entirely, not nulled — the whole response must not carry the key.
        $this->assertStringNotContainsString('expected_cash', json_encode($json));
    }

    public function test_owner_open_shift_summary_includes_expected_cash(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->getJson("/api/shifts/{$this->shift->id}/summary")
            ->assertOk()
            ->assertJsonPath('cash_drawer.expected_cash', 100);
    }

    public function test_cashier_sees_expected_cash_on_their_closed_shift_summary(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['10000' => 1],
        ])->assertOk();

        $this->getJson("/api/shifts/{$this->shift->id}/summary")
            ->assertOk()
            ->assertJsonPath('cash_drawer.expected_cash', 100);
    }

    public function test_count_attempt_as_cashier_returns_only_matches_and_attempt_number(): void
    {
        $res = $this->postJson("/api/shifts/{$this->shift->id}/count-attempt", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['5000' => 1], // 50 vs expected 100 — no reason required
        ])->assertOk();

        // The cashier learns ONLY that it does not match — never the target,
        // the size of the difference, or the direction.
        $res->assertJsonPath('matches', false)
            ->assertJsonPath('attempt_number', 1);
        $body = json_encode($res->json());
        $this->assertStringNotContainsString('expected_cash', $body);
        $this->assertStringNotContainsString('variance', $body);
        $this->assertStringNotContainsString('counted_cash', $body);

        $this->shift->refresh();
        $this->assertNull($this->shift->closed_at, 'A count attempt must not close the shift.');
    }

    public function test_count_attempt_still_records_true_numbers_for_a_cashier(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/count-attempt", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['5000' => 1],
        ])->assertOk();

        // The audit row keeps the full reconciliation even though the
        // response hid it — check the database, not the response.
        $attempt = ShiftCashCountAttempt::where('shift_id', $this->shift->id)->firstOrFail();
        $this->assertSame(1, $attempt->attempt_number);
        $this->assertFalse((bool) $attempt->is_accepted);
        $this->assertSame(['5000' => 1], $attempt->breakdown);
        $this->assertEqualsWithDelta(50.0, (float) $attempt->counted_cash, 0.001);
        $this->assertEqualsWithDelta(100.0, (float) $attempt->expected_cash, 0.001);
        $this->assertEqualsWithDelta(-50.0, (float) $attempt->variance, 0.001);
        $this->assertSame($this->cashier->id, $attempt->user_id);
    }

    public function test_count_attempt_as_owner_returns_full_reconciliation(): void
    {
        $owner = $this->makeOwner();
        Sanctum::actingAs($owner, ['staff']);
        $ownerShift = Shift::create([
            'user_id' => $owner->id,
            'opened_at' => now()->subHour(),
            'opening_cash' => 100,
        ]);

        $this->postJson("/api/shifts/{$ownerShift->id}/count-attempt", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['5000' => 1],
        ])->assertOk()
            ->assertJsonPath('matches', false)
            ->assertJsonPath('counted_cash', 50)
            ->assertJsonPath('expected_cash', 100)
            ->assertJsonPath('variance', -50)
            ->assertJsonPath('attempt_number', 1);
    }

    public function test_count_attempt_supports_plain_total(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/count-attempt", [
            'cash_count_method' => CashDenominationCatalog::METHOD_PLAIN_TOTAL,
            'closing_cash' => 100,
        ])->assertOk()
            ->assertJsonPath('matches', true)
            ->assertJsonPath('attempt_number', 1);

        $this->assertSame(
            CashDenominationCatalog::METHOD_PLAIN_TOTAL,
            ShiftCashCountAttempt::where('shift_id', $this->shift->id)->value('cash_count_method'),
        );
    }

    public function test_close_response_for_cashier_carries_no_expected_cash_or_variance(): void
    {
        $res = $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['5000' => 1],
            'notes' => 'Short — will explain',
        ])->assertOk();

        $shiftBody = $res->json('shift');
        $this->assertArrayNotHasKey('expected_cash', $shiftBody);
        $this->assertArrayNotHasKey('variance', $shiftBody);
        // The database still has the real reconciliation.
        $this->shift->refresh();
        $this->assertEqualsWithDelta(-50.0, (float) $this->shift->variance, 0.001);
        $this->assertEqualsWithDelta(100.0, (float) $this->shift->expected_cash, 0.001);
    }

    public function test_close_response_for_owner_keeps_expected_cash_and_variance(): void
    {
        $owner = $this->makeOwner();
        Sanctum::actingAs($owner, ['staff']);
        $ownerShift = Shift::create([
            'user_id' => $owner->id,
            'opened_at' => now()->subHour(),
            'opening_cash' => 100,
        ]);

        $this->postJson("/api/shifts/{$ownerShift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['5000' => 1],
            'notes' => 'Owner close',
        ])->assertOk()
            ->assertJsonPath('shift.expected_cash', fn ($v) => $v !== null)
            ->assertJsonPath('shift.variance', fn ($v) => $v !== null);
    }

    public function test_cashier_history_carries_no_expected_cash_or_variance_anywhere(): void
    {
        // One review + close so the shift also has embedded attempts.
        $this->postJson("/api/shifts/{$this->shift->id}/count-attempt", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => [],
        ])->assertOk();
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['5000' => 1],
            'notes' => 'short',
        ])->assertOk();

        $json = $this->getJson('/api/shifts/history')->assertOk()->json();
        $body = json_encode($json);
        $this->assertStringNotContainsString('expected_cash', $body);
        $this->assertStringNotContainsString('"variance"', $body);
    }

    public function test_owner_history_keeps_expected_cash_and_variance(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['5000' => 1],
            'notes' => 'short',
        ])->assertOk();

        $owner = $this->makeOwner();
        Sanctum::actingAs($owner, ['staff']);
        $this->getJson('/api/shifts/history')
            ->assertOk()
            ->assertJsonPath('shifts.0.id', $this->shift->id)
            ->assertJsonPath('shifts.0.expected_cash', fn ($v) => $v !== null)
            ->assertJsonPath('shifts.0.variance', fn ($v) => $v !== null);
    }

    public function test_count_attempt_rejects_someone_elses_shift(): void
    {
        $other = User::create([
            'name' => 'Other',
            'email' => 'blind-other@test.com',
            'password' => Hash::make('password'),
            'role_id' => $this->cashier->role_id,
            'pin_hash' => Hash::make('4321'),
            'is_active' => true,
        ]);
        $other->grantPermission('pos.close_shift');
        Sanctum::actingAs($other, ['staff']);

        $this->postJson("/api/shifts/{$this->shift->id}/count-attempt", [
            'closing_cash' => 100,
        ])->assertNotFound();
    }

    public function test_close_after_two_attempts_stores_both_and_marks_accepted(): void
    {
        // First count: MVR 200 short.
        $this->postJson("/api/shifts/{$this->shift->id}/count-attempt", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => [],
        ])->assertOk()->assertJsonPath('attempt_number', 1);

        // Recount balances, then close.
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['10000' => 1],
        ])->assertOk();

        $attempts = ShiftCashCountAttempt::where('shift_id', $this->shift->id)
            ->orderBy('attempt_number')
            ->get();

        $this->assertCount(2, $attempts);
        $this->assertEqualsWithDelta(-100.0, (float) $attempts[0]->variance, 0.001);
        $this->assertFalse((bool) $attempts[0]->is_accepted);
        $this->assertEqualsWithDelta(0.0, (float) $attempts[1]->variance, 0.001);
        $this->assertTrue((bool) $attempts[1]->is_accepted);

        // The recount leaves a dedicated audit entry.
        $audit = AuditLog::where('action', 'shift.closed_after_recount')
            ->where('model_id', $this->shift->id)
            ->first();
        $this->assertNotNull($audit, 'Closing after more than one attempt must write an audit entry.');
        $this->assertSame(2, $audit->meta['attempt_count'] ?? null);
    }

    public function test_close_on_first_count_records_single_accepted_attempt_and_no_recount_audit(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['10000' => 1],
        ])->assertOk();

        $attempts = ShiftCashCountAttempt::where('shift_id', $this->shift->id)->get();
        $this->assertCount(1, $attempts);
        $this->assertTrue((bool) $attempts[0]->is_accepted);

        $this->assertNull(
            AuditLog::where('action', 'shift.closed_after_recount')->where('model_id', $this->shift->id)->first(),
        );
    }

    public function test_close_with_variance_and_no_reason_is_still_rejected_after_an_attempt(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/count-attempt", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['5000' => 1],
        ])->assertOk();

        // Server rule is the guarantee, not the popup.
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['5000' => 1],
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Notes are required when cash variance is not zero.');

        $this->assertNull($this->shift->fresh()->closed_at);
    }

    public function test_foreign_currency_on_count_attempt_never_changes_the_maths(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/count-attempt", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['5000' => 1],
            'foreign_currency' => [
                ['currency' => 'USD', 'denomination' => 50, 'count' => 1, 'accepted_mvr' => 770],
            ],
        ])->assertOk()->assertJsonPath('matches', false);

        // Record-only: the stored attempt maths ignore the USD note entirely.
        $attempt = ShiftCashCountAttempt::where('shift_id', $this->shift->id)->firstOrFail();
        $this->assertEqualsWithDelta(50.0, (float) $attempt->counted_cash, 0.001);
        $this->assertEqualsWithDelta(100.0, (float) $attempt->expected_cash, 0.001);
        $this->assertEqualsWithDelta(-50.0, (float) $attempt->variance, 0.001);
    }

    public function test_history_surfaces_count_attempts_for_the_closed_shift(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/count-attempt", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => [],
        ])->assertOk();

        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['10000' => 1],
        ])->assertOk();

        $this->getJson('/api/shifts/history')
            ->assertOk()
            ->assertJsonPath('shifts.0.id', $this->shift->id)
            ->assertJsonPath('shifts.0.cash_count_attempts.0.attempt_number', 1)
            ->assertJsonPath('shifts.0.cash_count_attempts.0.is_accepted', false)
            ->assertJsonPath('shifts.0.cash_count_attempts.1.attempt_number', 2)
            ->assertJsonPath('shifts.0.cash_count_attempts.1.is_accepted', true);
    }

    public function test_shift_variances_report_shows_recount_happened(): void
    {
        $this->postJson("/api/shifts/{$this->shift->id}/count-attempt", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => [],
        ])->assertOk();
        $this->postJson("/api/shifts/{$this->shift->id}/close", [
            'cash_count_method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
            'denominations' => ['10000' => 1],
        ])->assertOk();

        $owner = $this->makeOwner();
        $owner->grantPermission('reports.financial');
        Sanctum::actingAs($owner, ['staff']);

        $rows = $this->getJson('/api/reports/shift-variances?from='.now()->toDateString().'&to='.now()->toDateString())
            ->assertOk()
            ->json('rows');

        $row = collect($rows)->firstWhere('id', $this->shift->id);
        $this->assertNotNull($row);
        $this->assertSame(2, $row['count_attempts']);
        $this->assertEqualsWithDelta(-100.0, (float) $row['first_attempt_variance'], 0.001);
    }
}
