<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Payments\Services\PaymentCommissionService;
use App\Domains\Shifts\CashDenominationCatalog;
use App\Domains\Shifts\DTOs\ShiftClosedData;
use App\Domains\Shifts\DTOs\ShiftOpenedData;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Domains\Shifts\Events\ShiftOpened;
use App\Http\Controllers\Controller;
use App\Http\Requests\CloseShiftRequest;
use App\Http\Requests\OpenShiftRequest;
use App\Models\CashMovement;
use App\Models\CustomerDepositLedger;
use App\Models\Device;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Shift;
use App\Models\ShiftCashCountAttempt;
use App\Services\AuditLogService;
use App\Services\PermissionService;
use App\Support\LaariConverter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ShiftController extends Controller
{
    public function current(Request $request)
    {
        $shift = Shift::where('user_id', $request->user()?->id)
            ->whereNull('closed_at')
            ->latest('opened_at')
            ->first();

        if ($shift) {
            $shift->load('cashMovements.user');
            $cashIn = $shift->cashMovements->whereIn('type', ['cash_in',  'paid_in'])->sum('amount');
            $cashOut = $shift->cashMovements->whereIn('type', ['cash_out', 'paid_out'])->sum('amount');
            $shift->setAttribute('total_cash_in', $cashIn);
            $shift->setAttribute('total_cash_out', $cashOut);
            $shift->setAttribute('cash_movements', $shift->cashMovements->values());
        }

        return response()->json(['shift' => $shift]);
    }

    /**
     * Single source of truth for "what should be in the cash drawer right now".
     * Used by both summary() and close() so the cashier never sees one number
     * on screen and a different one when they tap Close.
     *
     * @return array{opening:float,cash_in:float,cash_out:float,cash_sales:float,cash_refunds:float,expected:float}
     */
    private function expectedCashFor(Shift $shift): array
    {
        $cashIn = (float) CashMovement::where('shift_id', $shift->id)
            ->whereIn('type', ['cash_in', 'paid_in'])->sum('amount');
        $cashOut = (float) CashMovement::where('shift_id', $shift->id)
            ->whereIn('type', ['cash_out', 'paid_out'])->sum('amount');

        $cashSalesLaar = (int) Payment::where('method', 'cash')
            ->where('amount', '>', 0)
            ->where('shift_id', $shift->id)
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('COALESCE(SUM(COALESCE(amount_laar, ROUND(amount * 100))), 0) as total_laar')
            ->value('total_laar');

        // Settled only. Nothing in the codebase writes negative Payment rows
        // today, so this term is normally zero and exists to absorb legacy
        // data — but without the status filter a pending or failed negative
        // payment would empty the till on paper.
        $cashRefundsRawLaar = (int) Payment::where('method', 'cash')
            ->where('amount', '<', 0)
            ->where('shift_id', $shift->id)
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('COALESCE(SUM(COALESCE(amount_laar, ROUND(amount * 100))), 0) as total_laar')
            ->value('total_laar');

        // FIX 1: Prefer per-refund drawer_cash_out_laar when set so refunds
        // whose money came out of credit / gift / wallet / card don't
        // subtract from the till twice. Legacy rows with NULL fall back to
        // ROUND(amount * 100) — same behaviour as before this fix.
        // Pending requests must not empty the till — only approved/processed refunds.
        //
        // Matched on the drawer the cash actually left (stamped at approval),
        // falling back to the requesting shift for refunds approved before
        // drawer_shift_id existed. Approving a Monday refund on Tuesday used
        // to take the money out of Tuesday's till while reducing Monday's
        // expected cash — Tuesday's cashier counted short for it.
        $refundCashOutLaar = (int) Refund::whereRaw('COALESCE(drawer_shift_id, shift_id) = ?', [$shift->id])
            ->whereIn('status', ['approved', 'processed'])
            ->selectRaw('COALESCE(SUM(COALESCE(drawer_cash_out_laar, ROUND(amount * 100))), 0) as total_laar')
            ->value('total_laar');

        $opening = (float) ($shift->opening_cash ?? 0);
        $openingLaar = (int) round($opening * 100);
        $cashInLaar = (int) round($cashIn * 100);
        $cashOutLaar = (int) round($cashOut * 100);

        $expectedLaar = $openingLaar + $cashInLaar - $cashOutLaar + $cashSalesLaar + $cashRefundsRawLaar - $refundCashOutLaar;

        $depositCash = $this->depositCashTotalsForShift($shift->id);

        // FIX 4: sub-total cash_in rows tagged as credit repayments so
        // Z / summary can show the amount separately from generic paid-in.
        // expectedCashFor math is UNCHANGED — this is a display-only slice.
        $creditRepaymentsCashLaar = (int) CashMovement::where('shift_id', $shift->id)
            ->where('type', 'cash_in')
            ->where('category', 'credit_repayment')
            ->selectRaw('COALESCE(ROUND(SUM(amount) * 100), 0) as t')
            ->value('t');

        return [
            'opening' => $opening,
            'cash_in' => $cashIn,
            'cash_out' => $cashOut,
            'cash_sales' => round($cashSalesLaar / 100, 2),
            'cash_refunds' => round((abs($cashRefundsRawLaar) + $refundCashOutLaar) / 100, 2),
            'deposit_cash_received' => $depositCash['received'],
            'deposit_cash_refunded' => $depositCash['refunded'],
            'credit_repayments_cash_laar' => $creditRepaymentsCashLaar,
            'credit_repayments_cash' => round($creditRepaymentsCashLaar / 100, 2),
            'expected' => round($expectedLaar / 100, 2),
        ];
    }

    /**
     * Same role rule as canSeeOpenShiftExpectedCash in the POS client:
     * only owner/manager may see the expected total of an OPEN drawer.
     */
    private function canSeeOpenShiftExpectedCash($user): bool
    {
        $slug = strtolower(trim((string) ($user?->role?->slug ?? '')));

        return in_array($slug, ['owner', 'manager'], true);
    }

    /**
     * Counted cash from a close/count-attempt payload — the single place the
     * two endpoints share, so a review can never disagree with the close.
     *
     * @return array{method: string, breakdown: array<string,int>|null, closing_cash: float}
     */
    private function countedCashFromRequest(CloseShiftRequest $request): array
    {
        $method = (string) ($request->input('cash_count_method')
            ?? CashDenominationCatalog::METHOD_PLAIN_TOTAL);

        if ($method === CashDenominationCatalog::METHOD_DENOMINATIONS) {
            $rawCounts = is_array($request->input('denominations'))
                ? $request->input('denominations')
                : [];

            return [
                'method' => $method,
                'breakdown' => CashDenominationCatalog::normalizeBreakdown($rawCounts),
                'closing_cash' => LaariConverter::toMvr(CashDenominationCatalog::totalLaariFromCounts($rawCounts)),
            ];
        }

        return [
            'method' => CashDenominationCatalog::METHOD_PLAIN_TOTAL,
            'breakdown' => null,
            'closing_cash' => (float) $request->input('closing_cash'),
        ];
    }

    /**
     * Blind-count review: computes counted vs expected, RECORDS the attempt,
     * and returns the reconciliation — without closing the shift and without
     * requiring a variance reason. The attempt log is what makes it safe to
     * show the cashier the variance and let them recount: the owner can see
     * every count that was made.
     */
    public function countAttempt(CloseShiftRequest $request, int $id)
    {
        $result = DB::transaction(function () use ($request, $id) {
            $shift = Shift::where('user_id', $request->user()?->id)
                ->lockForUpdate()
                ->findOrFail($id);

            if ($shift->closed_at) {
                return null;
            }

            $counted = $this->countedCashFromRequest($request);
            $expectedCash = $this->expectedCashFor($shift)['expected'];

            $expectedLaari = LaariConverter::toLaar($expectedCash);
            $countedLaari = LaariConverter::toLaar($counted['closing_cash']);
            $varianceLaari = $countedLaari - $expectedLaari;
            $variance = LaariConverter::toMvr($varianceLaari);

            $attemptNumber = (int) ShiftCashCountAttempt::where('shift_id', $shift->id)->max('attempt_number') + 1;
            ShiftCashCountAttempt::create([
                'shift_id' => $shift->id,
                'user_id' => $request->user()?->id,
                'attempt_number' => $attemptNumber,
                'cash_count_method' => $counted['method'],
                'counted_cash' => $counted['closing_cash'],
                'expected_cash' => $expectedCash,
                'variance' => $variance,
                'breakdown' => $counted['breakdown'],
                'is_accepted' => false,
            ]);

            return [
                'matches' => abs($varianceLaari) < 1,
                'attempt_number' => $attemptNumber,
                'counted_cash' => $counted['closing_cash'],
                'expected_cash' => $expectedCash,
                'variance' => $variance,
            ];
        });

        if ($result === null) {
            return response()->json(['message' => 'Shift already closed.'], 422);
        }

        // The cashier must not learn the target, the size of the difference,
        // or the direction — only whether it matches. Owner/manager keep the
        // full reconciliation (the attempt row stores it for everyone).
        if (! $this->canSeeOpenShiftExpectedCash($request->user())) {
            $result = [
                'matches' => $result['matches'],
                'attempt_number' => $result['attempt_number'],
            ];
        }

        return response()->json($result);
    }

    /**
     * Record-only foreign notes held in the drawer at close.
     * Never adjusts expected cash, counted cash, or variance.
     *
     * @return list<array{currency:string,denomination:float,count:int,accepted_mvr_laari:int,accepted_mvr:float}>|null
     */
    private function normalizeForeignCurrencyHeld(mixed $rows): ?array
    {
        if (! is_array($rows) || $rows === []) {
            return null;
        }

        $out = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $currency = strtoupper(trim((string) ($row['currency'] ?? '')));
            $count = (int) ($row['count'] ?? 0);
            if ($currency === '' || $count < 1) {
                continue;
            }
            $acceptedMvr = (float) ($row['accepted_mvr'] ?? 0);
            $acceptedLaari = LaariConverter::toLaar($acceptedMvr);
            $out[] = [
                'currency' => substr($currency, 0, 3),
                'denomination' => round((float) ($row['denomination'] ?? 0), 2),
                'count' => $count,
                'accepted_mvr_laari' => $acceptedLaari,
                'accepted_mvr' => LaariConverter::toMvr($acceptedLaari),
            ];
        }

        return $out === [] ? null : $out;
    }

    /**
     * @return array{received: float, refunded: float}
     */
    private function depositCashTotalsForShift(int $shiftId): array
    {
        $receivedLaar = (int) CustomerDepositLedger::query()
            ->where('shift_id', $shiftId)
            ->where('type', 'top_up')
            ->where('method', 'cash')
            ->selectRaw('COALESCE(SUM(ABS(amount_laar)), 0) as t')
            ->value('t');

        $refundedLaar = (int) CustomerDepositLedger::query()
            ->where('shift_id', $shiftId)
            ->where('type', 'payout')
            ->where('method', 'cash')
            ->selectRaw('COALESCE(SUM(ABS(amount_laar)), 0) as t')
            ->value('t');

        return [
            'received' => round($receivedLaar / 100, 2),
            'refunded' => round($refundedLaar / 100, 2),
        ];
    }

    /**
     * Live shift summary — cash drawer breakdown + sales summary the cashier
     * can glance at any time without having to close the shift. Returns the
     * same numbers `close()` will use, so closing should never be a surprise.
     */
    public function summary(Request $request, int $id)
    {
        $user = $request->user();
        $canViewAll = app(PermissionService::class)->hasPermission($user, 'shifts.view_all_history');

        $shiftQuery = Shift::query()->where('id', $id);
        if (!$canViewAll) {
            $shiftQuery->where('user_id', $user?->id);
        }
        $shift = $shiftQuery->firstOrFail();

        $cash = $this->expectedCashFor($shift);
        $openingCash = $cash['opening'];
        $cashIn = $cash['cash_in'];
        $cashOut = $cash['cash_out'];
        $cashSales = $cash['cash_sales'];
        $cashRefunds = $cash['cash_refunds'];

        // A closed shift reports the figure it was closed on. Recomputing it
        // live meant anything that landed afterwards — a refund approved the
        // next morning — silently moved the expected cash of a drawer that had
        // already been counted and signed off, so the summary and the stored
        // variance disagreed about a shift nobody could still change.
        $expectedCash = ($shift->closed_at !== null && $shift->expected_cash !== null)
            ? (float) $shift->expected_cash
            : $cash['expected'];

        $paymentsInShift = $this->paymentsForShiftSummary($shift);

        $gross = (float) (clone $paymentsInShift)->sum('amount');
        $refundsTotal = (float) Refund::where('shift_id', $shift->id)
            ->whereNotIn('status', ['rejected'])
            ->sum('amount');

        $ordersCreated = Order::where('shift_id', $shift->id)
            ->whereNotIn('status', ['cancelled']);
        $ordersCreatedCount = (clone $ordersCreated)->count();

        $orderCount = (int) (clone $paymentsInShift)
            ->distinct()
            ->count('order_id');

        $tenders = (clone $paymentsInShift)
            ->select('method', DB::raw('SUM(amount) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        $commissionSummary = app(PaymentCommissionService::class)->paymentCommissionSummary(
            $shift->opened_at,
            $shift->closed_at ?? now(),
            [
                'payment_query' => fn ($q) => $this->scopePaymentsForShiftSummary($q, $shift),
            ],
        );

        $openUnpaidOrders = Order::where('shift_id', $shift->id)
            ->whereIn('payment_status', ['unpaid', 'partial'])
            ->whereNotIn('status', ['cancelled', 'refunded', 'completed'])
            ->count();

        // Blind count: while the shift is OPEN only owner/manager may see the
        // expected drawer total (same role rule as canSeeOpenShiftExpectedCash
        // in the POS). Omit the field — do not send 0 — so the client can tell
        // "not allowed" from "genuinely zero". Closed shifts are unchanged.
        $cashDrawer = [
            'opening_cash' => $openingCash,
            'cash_sales' => $cashSales,
            'cash_refunds' => $cashRefunds,
            'paid_in' => $cashIn,
            'paid_out' => $cashOut,
            'deposit_cash_received' => $cash['deposit_cash_received'] ?? 0,
            'deposit_cash_refunded' => $cash['deposit_cash_refunded'] ?? 0,
            'credit_repayments_cash_laar' => $cash['credit_repayments_cash_laar'] ?? 0,
            'credit_repayments_cash' => $cash['credit_repayments_cash'] ?? 0,
        ];
        if ($shift->closed_at !== null || $this->canSeeOpenShiftExpectedCash($user)) {
            $cashDrawer['expected_cash'] = $expectedCash;
        }

        return response()->json([
            'shift' => [
                'id' => $shift->id,
                'opened_at' => $shift->opened_at,
                'opening_cash' => $openingCash,
                'user_id' => $shift->user_id,
                'device_id' => $shift->device_id,
            ],
            'cash_drawer' => $cashDrawer,
            'sales_summary' => [
                'order_count' => $orderCount,
                'orders_created_count' => $ordersCreatedCount,
                'gross_sales' => $gross,
                'discounts' => 0,
                'refunds' => $refundsTotal,
                'net_sales' => $gross - $refundsTotal,
                'card_gross' => (float) ($commissionSummary['totals']['gross_commissionable'] ?? 0),
                'card_commission' => (float) ($commissionSummary['totals']['commission_total'] ?? 0),
                'card_net' => (float) ($commissionSummary['totals']['net_settlement'] ?? 0),
            ],
            'payment_commission' => $commissionSummary,
            'tenders' => $tenders,
            'open_unpaid_orders' => $openUnpaidOrders,
        ]);
    }

    /**
     * Payments that belong on this shift's sales summary.
     *
     * POS-tendered payments carry shift_id directly. Online/gateway
     * payments (BML, etc.) have no shift on the order — when exactly
     * one shift is open we also include gateway payments confirmed
     * during that shift so the POS header isn't stuck at "0 orders".
     */
    private function paymentsForShiftSummary(Shift $shift)
    {
        return Payment::query()->where(function ($q) use ($shift) {
            $this->scopePaymentsForShiftSummary($q, $shift);
        });
    }

    private function scopePaymentsForShiftSummary($query, Shift $shift): void
    {
        $gatewayMethods = ['bml_connect', 'bml_pay', 'bml', 'online', 'stripe'];
        $singleOpenShift = Shift::whereNull('closed_at')->count() === 1;

        $query->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->where(function ($q) use ($shift, $gatewayMethods, $singleOpenShift) {
                $q->where('shift_id', $shift->id);

                if ($singleOpenShift && $shift->closed_at === null) {
                    $q->orWhere(function ($q2) use ($shift, $gatewayMethods) {
                        $q2->whereNull('shift_id')
                            ->whereIn('method', $gatewayMethods)
                            ->where('processed_at', '>=', $shift->opened_at);
                    });
                }
            });
    }

    /**
     * Past shift list for this cashier (or every cashier — owners/managers).
     * Limited to the most recent 60 shifts to keep responses small.
     */
    public function history(Request $request)
    {
        $user = $request->user();
        $canViewAll = app(PermissionService::class)->hasPermission($user, 'shifts.view_all_history');

        $query = Shift::query()
            ->whereNotNull('closed_at')
            ->orderByDesc('opened_at')
            ->limit(60);

        if (!$canViewAll) {
            $query->where('user_id', $user?->id);
        }

        $shifts = $query
            ->with(['user:id,name', 'device:id,name,identifier', 'cashCountAttempts'])
            ->get();

        // Cashiers reviewing their own past shifts must not see the expected
        // totals or variances (their own counted totals are fine). This also
        // covers the embedded count attempts. Owner/manager unchanged.
        if (! $this->canSeeOpenShiftExpectedCash($user)) {
            $rows = $shifts->map(function (Shift $s) {
                $row = $s->toArray();
                unset($row['expected_cash'], $row['variance']);
                $row['cash_count_attempts'] = array_map(function (array $attempt) {
                    unset($attempt['expected_cash'], $attempt['variance']);

                    return $attempt;
                }, $row['cash_count_attempts'] ?? []);

                return $row;
            })->values();

            return response()->json(['shifts' => $rows]);
        }

        return response()->json(['shifts' => $shifts]);
    }

    /**
     * All currently open shifts (admin oversight).
     */
    public function live(Request $request)
    {
        $user = $request->user();
        if (!app(PermissionService::class)->hasPermission($user, 'shifts.view_all_history')) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $shifts = Shift::query()
            ->whereNull('closed_at')
            ->with(['user:id,name', 'device:id,name,identifier'])
            ->orderByDesc('opened_at')
            ->get();

        return response()->json(['shifts' => $shifts]);
    }

    /**
     * Owner/manager force-close a stuck shift.
     */
    public function forceClose(Request $request, int $id)
    {
        $actor = $request->user();
        if (!app(PermissionService::class)->hasPermission($actor, 'shifts.view_all_history')) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'notes' => 'nullable|string|max:500',
        ]);

        $shift = DB::transaction(function () use ($id, $validated, $actor) {
            $shift = Shift::lockForUpdate()->findOrFail($id);

            if ($shift->closed_at) {
                return null;
            }

            $cash = $this->expectedCashFor($shift);
            $expectedCash = $cash['expected'];

            $shift->update([
                'closed_at' => now(),
                'closing_cash' => $expectedCash,
                'expected_cash' => $expectedCash,
                'variance' => 0,
                'notes' => trim(($validated['notes'] ?? '') . ' [Force closed by ' . ($actor->name ?? 'admin') . ']'),
            ]);

            return $shift;
        });

        if ($shift === null) {
            return response()->json(['message' => 'Shift already closed.'], 422);
        }

        app(AuditLogService::class)->log(
            'shift.force_closed',
            'Shift',
            $shift->id,
            [],
            $shift->fresh()->toArray(),
            ['forced_by' => $actor->id],
            $request,
        );

        return response()->json(['shift' => $shift->fresh(), 'message' => 'Shift force-closed.']);
    }

    public function open(OpenShiftRequest $request)
    {
        $userId = $request->user()?->id;
        $deviceId = $request->input('device_id');
        if (!$deviceId) {
            $identifier = $request->header('X-Device-Identifier')
                ?? $request->header('X-Device-Id');
            if ($identifier) {
                $deviceId = Device::where('identifier', $identifier)->value('id');
            }
        }

        $shift = DB::transaction(function () use ($userId, $request, $deviceId) {
            // Lock any existing open shift row for this user to prevent double-open race
            $existing = Shift::where('user_id', $userId)
                ->whereNull('closed_at')
                ->lockForUpdate()
                ->first();

            if ($existing) {
                return null;
            }

            return Shift::create([
                'user_id' => $userId,
                'device_id' => $deviceId,
                'opened_at' => now(),
                'opening_cash' => $request->input('opening_cash'),
                'notes' => $request->input('notes'),
            ]);
        });

        if ($shift === null) {
            return response()->json(['message' => 'Shift already open.'], 422);
        }

        app(AuditLogService::class)->log(
            'shift.opened',
            'Shift',
            $shift->id,
            [],
            $shift->toArray(),
            [],
            $request,
        );

        event(new ShiftOpened(new ShiftOpenedData(
            shiftId: $shift->id,
            userId: $userId,
            userName: $request->user()?->name ?? 'Unknown',
            openingCash: (float) ($shift->opening_cash ?? 0),
        )));

        return response()->json(['shift' => $shift], 201);
    }

    public function close(CloseShiftRequest $request, $id)
    {
        // Wrap the close in a row-locked transaction so two concurrent
        // close requests (e.g. cashier double-tapping Close + manager
        // closing from the admin panel) can't both pass the
        // "already closed?" check and corrupt closing_cash / variance.
        // open() already uses lockForUpdate; close was the asymmetric
        // gap.
        $shift = DB::transaction(function () use ($id, $request) {
            $shift = Shift::where('user_id', $request->user()?->id)
                ->lockForUpdate()
                ->findOrFail($id);

            if ($shift->closed_at) {
                return null;
            }

            $cash = $this->expectedCashFor($shift);
            $expectedCash = $cash['expected'];

            $counted = $this->countedCashFromRequest($request);
            $method = $counted['method'];
            $breakdown = $counted['breakdown'];
            $closingCash = $counted['closing_cash'];

            // Foreign notes are recorded only — never enter expected/counted/variance.
            $foreignHeld = $this->normalizeForeignCurrencyHeld($request->input('foreign_currency'));

            $expectedLaari = LaariConverter::toLaar($expectedCash);
            $closingLaari = LaariConverter::toLaar($closingCash);
            $varianceLaari = $closingLaari - $expectedLaari;
            $variance = LaariConverter::toMvr($varianceLaari);
            $notes = trim((string) ($request->input('notes') ?? ''));

            if (abs($varianceLaari) >= 1 && $notes === '') {
                return ['error' => 'Notes are required when cash variance is not zero.'];
            }

            $shift->update([
                'closed_at' => now(),
                'closing_cash' => $closingCash,
                'expected_cash' => $expectedCash,
                'variance' => $variance,
                'cash_count_method' => $method,
                'cash_count_breakdown' => $breakdown,
                'foreign_currency_held' => $foreignHeld,
                'notes' => $notes !== '' ? $notes : $shift->notes,
            ]);

            // The accepted count joins the attempt log so the full recount
            // history (reviews + final) reads as one sequence.
            $attemptNumber = (int) ShiftCashCountAttempt::where('shift_id', $shift->id)->max('attempt_number') + 1;
            ShiftCashCountAttempt::create([
                'shift_id' => $shift->id,
                'user_id' => $request->user()?->id,
                'attempt_number' => $attemptNumber,
                'cash_count_method' => $method,
                'counted_cash' => $closingCash,
                'expected_cash' => $expectedCash,
                'variance' => $variance,
                'breakdown' => $breakdown,
                'is_accepted' => true,
            ]);

            return $shift;
        });

        if (is_array($shift) && isset($shift['error'])) {
            return response()->json(['message' => $shift['error']], 422);
        }

        if ($shift === null) {
            return response()->json(['message' => 'Shift already closed.'], 422);
        }

        // Re-read cash breakdown outside the lock for the response body /
        // audit log payload — at this point the close is committed so
        // the totals are stable.
        $cash = $this->expectedCashFor($shift);
        $cashIn = $cash['cash_in'];
        $cashOut = $cash['cash_out'];
        $cashSales = $cash['cash_sales'];
        $expectedCash = $cash['expected'];
        $closingCash = (float) $shift->closing_cash;
        $variance = (float) $shift->variance;

        app(AuditLogService::class)->log(
            'shift.closed',
            'Shift',
            $shift->id,
            [
                'closed_at' => null,
                'closing_cash' => $shift->getOriginal('closing_cash'),
                'expected_cash' => $shift->getOriginal('expected_cash'),
                'variance' => $shift->getOriginal('variance'),
            ],
            [
                'closed_at' => $shift->closed_at,
                'closing_cash' => $shift->closing_cash,
                'expected_cash' => $shift->expected_cash,
                'variance' => $shift->variance,
            ],
            [
                'cash_sales' => $cashSales,
                'cash_in' => $cashIn,
                'cash_out' => $cashOut,
            ],
            $request,
        );

        // A recount happened — leave a distinct trail for the owner beside
        // the attempt rows themselves.
        $attempts = ShiftCashCountAttempt::where('shift_id', $shift->id)
            ->orderBy('attempt_number')
            ->get();
        if ($attempts->count() > 1) {
            app(AuditLogService::class)->log(
                'shift.closed_after_recount',
                'Shift',
                $shift->id,
                [],
                [
                    'attempts' => $attempts->map(fn (ShiftCashCountAttempt $a) => [
                        'attempt_number' => $a->attempt_number,
                        'counted_cash' => (float) $a->counted_cash,
                        'variance' => (float) $a->variance,
                        'is_accepted' => (bool) $a->is_accepted,
                    ])->all(),
                ],
                ['attempt_count' => $attempts->count()],
                $request,
            );
        }

        $orderCount = (int) Payment::query()
            ->where('shift_id', $shift->id)
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->distinct()
            ->count('order_id');

        $totalRevenue = (float) Payment::where('shift_id', $shift->id)
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->sum('amount');

        $openUnpaidOrders = Order::where('shift_id', $shift->id)
            ->whereIn('payment_status', ['unpaid', 'partial'])
            ->whereNotIn('status', ['cancelled', 'refunded', 'completed'])
            ->count();

        event(new ShiftClosed(new ShiftClosedData(
            shiftId: $shift->id,
            userId: $shift->user_id,
            userName: $request->user()?->name ?? 'Unknown',
            expectedCash: (float) $expectedCash,
            actualCash: $closingCash,
            variance: (float) $variance,
            orderCount: $orderCount,
            totalRevenue: $totalRevenue,
        )));

        // Blind count round 2: handing the cashier the closed shift model
        // would reveal the exact shortage one second after closing. Strip
        // the reconciliation fields unless the closer is owner/manager.
        $shiftBody = $shift->toArray();
        if (! $this->canSeeOpenShiftExpectedCash($request->user())) {
            unset($shiftBody['expected_cash'], $shiftBody['variance']);
        }

        $response = [
            'shift' => $shiftBody,
            'cash_sales' => $cashSales,
            'cash_in' => $cashIn,
            'cash_out' => $cashOut,
        ];

        if ($openUnpaidOrders > 0) {
            $response['open_unpaid_orders'] = $openUnpaidOrders;
            $response['message'] = 'This shift has open unpaid orders created during it. They will remain active and can be paid by another staff shift.';
        }

        return response()->json($response);
    }
}
