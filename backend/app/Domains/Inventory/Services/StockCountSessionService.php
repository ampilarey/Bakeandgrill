<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Services;

use App\Models\InventoryItem;
use App\Models\StockCountLine;
use App\Models\StockCountSession;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A stocktake with the four properties a one-shot POST cannot have.
 *
 * 1. It survives the count. Lines are saved as they are entered, so an hour in
 *    the store room is not lost to a dropped connection or a locked phone.
 * 2. It is blind. The expected figure is snapshotted when the sheet opens and
 *    is never sent to the person counting — `linesFor()` decides that, and it
 *    is the reason this is a session rather than a form.
 * 3. It is reviewed. Variances are valued against the cost frozen at open, and
 *    anything over the house threshold has to say why before it posts.
 * 4. It is posted by somebody else. The person who counted does not also
 *    accept the shortfall, the same separation the refund flow has.
 *
 * Nothing moves stock until `post()`. Opening, counting and submitting write
 * only to this session's own tables.
 */
final class StockCountSessionService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /**
     * Open a sheet over the whole store room, or one category of it.
     *
     * The snapshot is taken here, once, under a lock. Sales keep happening
     * during a count, so a line counted at 9pm must be compared against what
     * was on the books when the sheet opened — not against live stock two
     * hours later, which would report the evening's trading as a variance.
     */
    public function open(User $opener, ?int $categoryId, ?string $note, ?Request $request = null): StockCountSession
    {
        $existing = StockCountSession::whereIn('status', [
            StockCountSession::STATUS_OPEN,
            StockCountSession::STATUS_SUBMITTED,
        ])->first();
        if ($existing !== null) {
            throw ValidationException::withMessages([
                'session' => [sprintf(
                    'Stock count %s is still %s. Finish or cancel it before starting another.',
                    $existing->reference,
                    $existing->status,
                )],
            ]);
        }

        return DB::transaction(function () use ($opener, $categoryId, $note, $request) {
            $items = InventoryItem::query()
                ->where('is_active', true)
                ->when($categoryId !== null, fn ($q) => $q->where('inventory_category_id', $categoryId))
                ->lockForUpdate()
                ->orderBy('name')
                ->get();

            if ($items->isEmpty()) {
                throw ValidationException::withMessages([
                    'session' => ['There are no active inventory items to count in that scope.'],
                ]);
            }

            $session = StockCountSession::create([
                'reference' => $this->nextReference(),
                'status' => StockCountSession::STATUS_OPEN,
                'inventory_category_id' => $categoryId,
                'note' => $note,
                'opened_by' => $opener->id,
                'opened_at' => now(),
            ]);

            foreach ($items as $item) {
                StockCountLine::create([
                    'stock_count_session_id' => $session->id,
                    'inventory_item_id' => $item->id,
                    'snapshot_qty' => (float) ($item->current_stock ?? 0),
                    'snapshot_unit_cost' => (float) ($item->unit_cost ?? 0),
                ]);
            }

            $this->audit->log(
                'inventory.stock_count_opened',
                'StockCountSession',
                $session->id,
                [],
                ['reference' => $session->reference, 'lines' => $items->count()],
                ['category_id' => $categoryId],
                $request,
            );

            return $session->fresh(['lines']);
        });
    }

    /**
     * Save what has been counted so far. Safe to call repeatedly.
     *
     * @param array<int, array{line_id: int, counted_qty: float|null, note?: string|null}> $entries
     */
    public function saveCounts(StockCountSession $session, User $counter, array $entries, ?Request $request = null): StockCountSession
    {
        if (!$session->isEditable()) {
            throw ValidationException::withMessages([
                'session' => ['This count is no longer open for entry.'],
            ]);
        }

        DB::transaction(function () use ($session, $counter, $entries) {
            $lines = StockCountLine::where('stock_count_session_id', $session->id)
                ->whereIn('id', array_column($entries, 'line_id'))
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            foreach ($entries as $entry) {
                $line = $lines->get($entry['line_id']);
                if ($line === null) {
                    continue;
                }
                $counted = $entry['counted_qty'];
                $line->fill([
                    'counted_qty' => $counted === null ? null : (float) $counted,
                    'note' => $entry['note'] ?? $line->note,
                    // Clearing a line clears who counted it, so a blanked entry
                    // does not read as "someone counted this as nothing".
                    'counted_by' => $counted === null ? null : $counter->id,
                    'counted_at' => $counted === null ? null : now(),
                ])->save();
            }
        });

        return $session->fresh(['lines']);
    }

    /** Hand the sheet over for review. */
    public function submit(StockCountSession $session, User $counter, ?Request $request = null): StockCountSession
    {
        if (!$session->isEditable()) {
            throw ValidationException::withMessages([
                'session' => ['Only an open count can be submitted.'],
            ]);
        }
        if ($session->lines()->whereNotNull('counted_qty')->count() === 0) {
            throw ValidationException::withMessages([
                'session' => ['Count at least one item before submitting.'],
            ]);
        }

        $session->update([
            'status' => StockCountSession::STATUS_SUBMITTED,
            'submitted_by' => $counter->id,
            'submitted_at' => now(),
        ]);

        $this->audit->log(
            'inventory.stock_count_submitted',
            'StockCountSession',
            $session->id,
            [],
            ['reference' => $session->reference, 'counted' => $session->lines()->whereNotNull('counted_qty')->count()],
            [],
            $request,
        );

        return $session->fresh(['lines']);
    }

    /**
     * Accept the count and move the stock.
     *
     * Two rules that make this different from the one-shot endpoint:
     *
     *  - the poster may not be the person who submitted it, unless they are an
     *    owner. Counting your own shortfall and signing it off is the whole
     *    thing this workflow exists to prevent;
     *  - a line whose variance is worth more than the house threshold must
     *    carry a reason, and posting is refused — as a whole — until it does.
     *    A half-posted stocktake is worse than a rejected one.
     */
    public function post(StockCountSession $session, User $poster, bool $isOwner, ?Request $request = null): StockCountSession
    {
        if ($session->status !== StockCountSession::STATUS_SUBMITTED) {
            throw ValidationException::withMessages([
                'session' => ['Only a submitted count can be posted.'],
            ]);
        }
        if (!$isOwner && (int) $session->submitted_by === (int) $poster->id) {
            throw ValidationException::withMessages([
                'session' => ['You cannot post a count you submitted. Another authoriser must accept it.'],
            ]);
        }

        $session->load('lines.item');
        $missing = [];
        foreach ($session->lines as $line) {
            if (!$line->isCounted()) {
                continue;
            }
            if (trim((string) $line->note) === ''
                && StockVariancePolicy::needsReason($line->variance(), (float) $line->snapshot_unit_cost)) {
                $missing["lines.{$line->id}.note"] = [sprintf(
                    '%s is out by %s %s — MVR %s. A reason is needed for a difference worth MVR %s or more.',
                    $line->item?->name ?? "Item #{$line->inventory_item_id}",
                    rtrim(rtrim(number_format(abs($line->variance()), 3, '.', ''), '0'), '.'),
                    $line->item?->unit ?? 'units',
                    number_format($line->varianceValueMvr(), 2),
                    number_format(StockVariancePolicy::thresholdMvr(), 2),
                )];
            }
        }
        if ($missing !== []) {
            throw ValidationException::withMessages($missing);
        }

        return DB::transaction(function () use ($session, $poster, $request) {
            $applied = 0;
            foreach ($session->lines as $line) {
                if (!$line->isCounted()) {
                    continue;
                }
                $item = InventoryItem::lockForUpdate()->find($line->inventory_item_id);
                if ($item === null) {
                    continue;
                }

                /*
                 * Move by the variance against the snapshot, not by setting
                 * stock to the counted figure.
                 *
                 * Sales made during the count have already come off the books.
                 * Setting stock to what was counted at 9pm would put those
                 * sales back on the shelf; adding the difference keeps them off
                 * and still corrects the discrepancy the count found.
                 */
                $difference = $line->variance();
                if (abs($difference) < 0.0005) {
                    continue;
                }

                $before = (float) ($item->current_stock ?? 0);
                $item->current_stock = $before + $difference;
                $item->save();

                StockMovement::create([
                    'inventory_item_id' => $item->id,
                    'user_id' => $poster->id,
                    'type' => 'adjustment',
                    'quantity' => $difference,
                    'balance_after' => $item->current_stock,
                    'unit_cost' => (float) $line->snapshot_unit_cost,
                    'reference_type' => 'stock_count',
                    'reference_id' => $session->id,
                    'notes' => trim((string) $line->note) !== ''
                        ? $line->note
                        : "Stock count {$session->reference}",
                ]);
                $applied++;
            }

            $session->update([
                'status' => StockCountSession::STATUS_POSTED,
                'posted_by' => $poster->id,
                'posted_at' => now(),
            ]);

            $this->audit->log(
                'inventory.stock_count_posted',
                'StockCountSession',
                $session->id,
                ['status' => StockCountSession::STATUS_SUBMITTED],
                ['status' => StockCountSession::STATUS_POSTED],
                [
                    'reference' => $session->reference,
                    'lines_applied' => $applied,
                    'submitted_by' => $session->submitted_by,
                    'posted_by' => $poster->id,
                    'variance_value_mvr' => round($this->totalVarianceValue($session), 2),
                ],
                $request,
            );

            return $session->fresh(['lines']);
        });
    }

    /**
     * Send a submitted sheet back to the counter.
     *
     * The reviewer's third option. Posting is all-or-nothing and refuses a
     * costly variance with no reason, so without this the only ways out of a
     * sheet that needs one more note were to cancel an hour of counting or to
     * post something unexplained. Counts already entered are kept.
     */
    public function reopen(StockCountSession $session, User $reviewer, ?string $note = null, ?Request $request = null): StockCountSession
    {
        if ($session->status !== StockCountSession::STATUS_SUBMITTED) {
            throw ValidationException::withMessages([
                'session' => ['Only a submitted count can be sent back.'],
            ]);
        }

        $session->update([
            'status' => StockCountSession::STATUS_OPEN,
            'submitted_by' => null,
            'submitted_at' => null,
            'note' => $note ?? $session->note,
        ]);

        $this->audit->log(
            'inventory.stock_count_reopened',
            'StockCountSession',
            $session->id,
            ['status' => StockCountSession::STATUS_SUBMITTED],
            ['status' => StockCountSession::STATUS_OPEN],
            ['reference' => $session->reference, 'reviewer' => $reviewer->id, 'note' => $note],
            $request,
        );

        return $session->fresh(['lines']);
    }

    public function cancel(StockCountSession $session, User $user, ?Request $request = null): StockCountSession
    {
        if ($session->isTerminal()) {
            throw ValidationException::withMessages([
                'session' => ['This count is already finished.'],
            ]);
        }

        $session->update([
            'status' => StockCountSession::STATUS_CANCELLED,
            'cancelled_by' => $user->id,
            'cancelled_at' => now(),
        ]);

        $this->audit->log(
            'inventory.stock_count_cancelled',
            'StockCountSession',
            $session->id,
            [],
            ['reference' => $session->reference],
            [],
            $request,
        );

        return $session->fresh(['lines']);
    }

    /**
     * The sheet, shaped for who is looking at it.
     *
     * This is where "blind" is enforced. While a count is open, the expected
     * quantity, its value and the variance are simply absent from the payload —
     * not hidden by the client, not sent and styled away. Once the sheet is
     * submitted, a reviewer sees everything.
     *
     * @return array<int, array<string, mixed>>
     */
    public function linesFor(StockCountSession $session, bool $canReview): array
    {
        $session->loadMissing('lines.item');
        $reveal = $canReview && $session->status !== StockCountSession::STATUS_OPEN;

        return $session->lines->map(function (StockCountLine $line) use ($reveal) {
            $row = [
                'id' => $line->id,
                'inventory_item_id' => $line->inventory_item_id,
                'name' => $line->item?->name,
                'unit' => $line->item?->unit,
                'sku' => $line->item?->sku,
                'counted_qty' => $line->counted_qty,
                'note' => $line->note,
                'counted_at' => $line->counted_at?->toIso8601String(),
            ];

            if ($reveal) {
                $row['snapshot_qty'] = (float) $line->snapshot_qty;
                $row['snapshot_unit_cost'] = (float) $line->snapshot_unit_cost;
                $row['variance'] = $line->isCounted() ? round($line->variance(), 3) : null;
                $row['variance_value_mvr'] = $line->isCounted() ? round($line->varianceValueMvr(), 2) : null;
                $row['needs_reason'] = $line->isCounted()
                    && StockVariancePolicy::needsReason($line->variance(), (float) $line->snapshot_unit_cost);
            }

            return $row;
        })->all();
    }

    /** Money at stake across the whole sheet, for the review header. */
    public function totalVarianceValue(StockCountSession $session): float
    {
        $session->loadMissing('lines');

        return (float) $session->lines->sum(fn (StockCountLine $l) => $l->isCounted() ? $l->varianceValueMvr() : 0.0);
    }

    /** SC-2026-0007. Sequential within the year, so a gap is visible. */
    private function nextReference(): string
    {
        $year = now()->format('Y');
        $count = StockCountSession::whereYear('created_at', $year)->count();

        for ($attempt = 1; $attempt <= 50; $attempt++) {
            $candidate = sprintf('SC-%s-%04d', $year, $count + $attempt);
            if (!StockCountSession::where('reference', $candidate)->exists()) {
                return $candidate;
            }
        }

        return sprintf('SC-%s-%s', $year, strtoupper(substr(bin2hex(random_bytes(4)), 0, 6)));
    }
}
