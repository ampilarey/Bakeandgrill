<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Domains\Finance\Services\BankStatementParser;
use App\Domains\Finance\Services\SettlementLedgerService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\BankStatementLine;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\BusinessDay;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

/**
 * Owner, 2026-09-07: "the system must match actual money received." Card
 * and QR land in one account a day or more later, sometimes in halves;
 * transfers land in another, line by line; cash is handed over. Deposits are
 * applied oldest-day-first so nobody has to guess which day they were for.
 */
class BankSettlementTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner();
        Sanctum::actingAs($this->owner, ['staff']);
        SiteSetting::set('settlement_start_date', '');
        SiteSetting::set('settlement_tolerance_laar', '100');
        SiteSetting::set('settlement_alert_days', '3');
    }

    private function day(int $daysAgo): string
    {
        return Carbon::parse(BusinessDay::todayYmd())->subDays($daysAgo)->toDateString();
    }

    /** A settled payment on a business day, with the commission already stamped. */
    private function payment(string $method, float $amount, string $ymd, ?int $commissionLaar = null, ?string $reference = null): Payment
    {
        $order = Order::factory()->paid()->create(['customer_id' => $this->makeCustomer()->id, 'total' => $amount]);
        [$start] = BusinessDay::bounds($ymd);

        return Payment::create([
            'order_id' => $order->id,
            'method' => $method,
            'amount' => $amount,
            'amount_laar' => (int) round($amount * 100),
            'commission_laar' => $commissionLaar ?? 0,
            'status' => 'paid',
            'reference_number' => $reference,
            'processed_at' => $start->copy()->addHours(12),
            'idempotency_key' => 'settle-test-' . uniqid(),
        ]);
    }

    private function line(string $account, float $amount, string $ymd, ?string $description = null, ?string $forDate = null, ?string $kind = null): BankStatementLine
    {
        $import = \App\Models\BankStatementImport::firstOrCreate(['account' => $account, 'filename' => 'test.csv'], ['imported_by' => $this->owner->id]);

        return BankStatementLine::create([
            'import_id' => $import->id,
            'account' => $account,
            'txn_date' => $ymd,
            'for_date' => $forDate,
            'kind' => $kind,
            'description' => $description,
            'amount_laar' => (int) round($amount * 100),
            'fingerprint' => hash('sha256', uniqid('', true)),
        ]);
    }

    /** One row of a BML CSV export: no header, eleven quoted columns, Excel-style ="…" wrapping. */
    private function bmlRow(string $ymd, string $type, string $detail, string $party, string $col7, ?float $debit, ?float $credit, float $balance): string
    {
        static $n = 0;
        $n++;
        $slash = str_replace('-', '/', $ymd);
        $cells = [
            $slash, $slash, $type, '="BLAZ' . str_pad((string) $n, 12, '0', STR_PAD_LEFT) . '"', '="FT26' . str_pad((string) $n, 8, '0', STR_PAD_LEFT) . '\B26"',
            $detail, '="' . $party . '"', $col7, $debit === null ? '' : number_format($debit, 2, '.', ''), $credit === null ? '' : number_format($credit, 2, '.', ''), number_format($balance, 2, '.', ''),
        ];

        return implode(',', array_map(fn ($c) => '"' . str_replace('"', '""', $c) . '"', $cells));
    }

    private function bmlPos(string $statementYmd, string $salesYmd, float $credit): string
    {
        return $this->bmlRow($statementYmd, 'POS Credit Transfer', '000000 65018311', '8633209960', str_replace('-', '', $salesYmd), null, $credit, 10000);
    }

    private function bmlTransfer(string $statementYmd, string $sentYmd, string $sender, ?float $credit, ?float $debit = null): string
    {
        $sent = Carbon::parse($sentYmd)->format('d-m-Y') . ' 13-16-13';

        return $this->bmlRow($statementYmd, $credit !== null ? 'Transfer Credit' : 'Transfer Debit', $sent, $sender, 'Internet Banking', $debit, $credit, 10000);
    }

    // ── card & QR: oldest day first ──────────────────────────────────────────

    public function test_a_part_deposit_settles_the_oldest_day_first_and_the_next_one_finishes_it(): void
    {
        // Day 1: MVR 100 by card, 2.50 commission → the bank owes 97.50.
        // Day 2: MVR 50 by QR, 1.25 commission → owes 48.75.
        $this->payment('card', 100, $this->day(2), 250);
        $this->payment('qr', 50, $this->day(1), 125);

        // Only 60 arrived on day 2 — half of day 1, roughly.
        $this->line('card_qr', 60.00, $this->day(1));

        $ledger = app(SettlementLedgerService::class)->cardQr($this->day(3), $this->day(0));
        $byDate = collect($ledger['days'])->keyBy('date');
        $this->assertSame('partial', $byDate[$this->day(2)]['status']);
        $this->assertSame(6000, $byDate[$this->day(2)]['allocated_laar']);
        $this->assertSame(3750, $byDate[$this->day(2)]['remaining_laar']);
        $this->assertSame('awaiting', $byDate[$this->day(1)]['status']);
        $this->assertSame(3750 + 4875, $ledger['totals']['outstanding_laar']);
        $this->assertSame($this->day(2), $ledger['totals']['oldest_open_date']);

        // The rest of day 1 and all of day 2 come the day after.
        $this->line('card_qr', 86.25, $this->day(0));

        $ledger = app(SettlementLedgerService::class)->cardQr($this->day(3), $this->day(0));
        $byDate = collect($ledger['days'])->keyBy('date');
        $this->assertSame('settled', $byDate[$this->day(2)]['status']);
        $this->assertSame('settled', $byDate[$this->day(1)]['status']);
        $this->assertSame(0, $ledger['totals']['outstanding_laar']);
        $this->assertSame(0, $ledger['totals']['excess_laar']);
        $this->assertNull($ledger['totals']['oldest_open_date']);
    }

    public function test_a_pos_credit_settles_the_day_the_bank_names_not_the_oldest_open_day(): void
    {
        // Owner, 2026-09-07: "1st day of the month will be from 2nd day
        // deposit onwards" — a BML POS credit says which sales day it is for.
        $this->payment('card', 100, $this->day(4), 0);
        $this->payment('qr', 50, $this->day(3), 0);

        // Day 3's takings arrived on day 1, labelled for day 3. Oldest-first
        // would have put them against day 4; the label wins.
        $this->line('card_qr', 50.00, $this->day(1), 'POS Credit Transfer', $this->day(3), 'pos');

        $ledger = app(SettlementLedgerService::class)->cardQr($this->day(5), $this->day(0));
        $byDate = collect($ledger['days'])->keyBy('date');
        $this->assertSame('settled', $byDate[$this->day(3)]['status']);
        $this->assertSame('overdue', $byDate[$this->day(4)]['status']);
        $this->assertSame([['date' => $this->day(3), 'amount_laar' => 5000]], $ledger['deposits'][0]['applied_to']);

        // The bank paid 130 for day 4 when the till only took 100: the
        // difference is shown against that day, not spread or swallowed.
        $this->line('card_qr', 130.00, $this->day(0), 'POS Credit Transfer', $this->day(4), 'pos');

        $ledger = app(SettlementLedgerService::class)->cardQr($this->day(5), $this->day(0));
        $day4 = collect($ledger['days'])->firstWhere('date', $this->day(4));
        $this->assertSame('over', $day4['status']);
        $this->assertSame(3000, $day4['over_laar']);
        $this->assertSame(0, $day4['remaining_laar']);
        $this->assertSame(1, $ledger['totals']['over_days']);
        $this->assertSame(3000, $ledger['totals']['over_laar']);
        $this->assertSame(0, $ledger['totals']['excess_laar']);
        $this->assertSame(0, $ledger['totals']['outstanding_laar']);
    }

    public function test_a_day_still_owed_after_the_alert_window_is_overdue(): void
    {
        $this->payment('card', 100, $this->day(5), 250);

        $ledger = app(SettlementLedgerService::class)->cardQr($this->day(6), $this->day(0));
        $day = collect($ledger['days'])->firstWhere('date', $this->day(5));
        $this->assertSame('overdue', $day['status']);
        $this->assertSame(1, $ledger['totals']['overdue_days']);
    }

    public function test_a_deposit_cannot_pay_for_a_day_after_its_own_date(): void
    {
        $this->payment('card', 100, $this->day(1), 0);
        // Yesterday's deposit is far more than yesterday's takings…
        $this->line('card_qr', 300.00, $this->day(1));
        // …but today's sale has not happened yet as far as that deposit knows.
        $this->payment('qr', 40, $this->day(0), 0);

        $ledger = app(SettlementLedgerService::class)->cardQr($this->day(2), $this->day(0));
        $byDate = collect($ledger['days'])->keyBy('date');
        $this->assertSame('settled', $byDate[$this->day(1)]['status']);
        $this->assertSame('awaiting', $byDate[$this->day(0)]['status']);
        $this->assertSame(20000, $ledger['totals']['excess_laar'], 'the unexplained 200 is shown, not silently swallowed');
    }

    public function test_a_difference_within_tolerance_counts_as_settled(): void
    {
        $this->payment('card', 100, $this->day(1), 0);
        $this->line('card_qr', 99.50, $this->day(0));

        $ledger = app(SettlementLedgerService::class)->cardQr($this->day(2), $this->day(0));
        $this->assertSame('settled', collect($ledger['days'])->firstWhere('date', $this->day(1))['status']);
    }

    public function test_days_before_the_start_date_are_left_alone(): void
    {
        SiteSetting::set('settlement_start_date', $this->day(1));
        $this->payment('card', 100, $this->day(3), 0);

        $ledger = app(SettlementLedgerService::class)->cardQr($this->day(5), $this->day(0));
        $this->assertNull(collect($ledger['days'])->firstWhere('date', $this->day(3)));
        $this->assertSame(0, $ledger['totals']['outstanding_laar']);
    }

    // ── statements ───────────────────────────────────────────────────────────

    public function test_the_parser_reads_a_csv_with_debit_and_credit_columns(): void
    {
        $csv = implode("\n", [
            'Bank of Maldives - Account Statement',
            '',
            'Date,Description,Reference,Debit,Credit,Balance',
            '02/09/2026,"POS SETTLEMENT 01/09",S12345,,"1,234.50","10,000.00"',
            '02/09/2026,ATM WITHDRAWAL,,500.00,,"9,500.00"',
            '03/09/2026,QR PAYMENT,Q777,,45.00,"9,545.00"',
            '',
        ]);
        $path = tempnam(sys_get_temp_dir(), 'stmt') . '.csv';
        file_put_contents($path, $csv);

        $parsed = app(BankStatementParser::class)->parse($path, 'stmt.csv');

        $this->assertNull($parsed['error']);
        $this->assertCount(2, $parsed['lines']);
        $this->assertSame('generic', $parsed['format']);
        $this->assertSame([
            'txn_date' => '2026-09-02', 'for_date' => null, 'kind' => null, 'description' => 'POS SETTLEMENT 01/09', 'reference' => 'S12345',
            'counterparty' => null, 'amount_laar' => 123450, 'balance_laar' => 1000000,
        ], $parsed['lines'][0]);
        $this->assertSame(4500, $parsed['lines'][1]['amount_laar']);
        $this->assertSame(1, $parsed['debit_count']);
    }

    public function test_the_parser_reads_an_xlsx_with_one_signed_amount_column(): void
    {
        $sheet = new Spreadsheet;
        $ws = $sheet->getActiveSheet();
        $ws->fromArray([
            ['Transaction Date', 'Narration', 'Amount'],
            ['2026-09-02', 'Card settlement', 900.25],
            ['2026-09-02', 'Fee', -12],
        ]);
        $path = tempnam(sys_get_temp_dir(), 'stmt') . '.xlsx';
        (new Xlsx($sheet))->save($path);

        $parsed = app(BankStatementParser::class)->parse($path, 'stmt.xlsx');

        $this->assertNull($parsed['error']);
        $this->assertCount(1, $parsed['lines']);
        $this->assertSame(90025, $parsed['lines'][0]['amount_laar']);
        $this->assertSame('2026-09-02', $parsed['lines'][0]['txn_date']);
    }

    public function test_the_parser_reads_a_bml_export_that_has_no_header_row(): void
    {
        $csv = implode("\n", [
            $this->bmlPos('2026-08-09', '2026-08-06', 575.19),
            $this->bmlPos('2026-08-09', '2026-08-06', 153.45),
            $this->bmlRow('2026-08-09', 'Transfer Debit', '09-08-2026 06-00-15', 'MAUMOON ABDUL SAMAD', 'Internet Banking', 2000, null, 23504.86),
            $this->bmlTransfer('2026-08-11', '2026-08-10', 'ASIF MOOSA IBRAHIM', 2000),
            $this->bmlRow('2026-08-23', 'Credit Card Payment', '23-08-2026 08-20-16', 'Internet Banking', '', 447, null, 2000),
            '',
        ]);
        $path = tempnam(sys_get_temp_dir(), 'stmt') . '.csv';
        file_put_contents($path, $csv);

        $parsed = app(BankStatementParser::class)->parse($path, 'bml.csv');

        $this->assertNull($parsed['error']);
        $this->assertSame('bml', $parsed['format']);
        $this->assertCount(3, $parsed['lines']);
        $this->assertSame(2, $parsed['debit_count']);
        $this->assertSame(0, $parsed['unreadable_count']);

        $pos = $parsed['lines'][0];
        $this->assertSame('2026-08-09', $pos['txn_date']);
        $this->assertSame('2026-08-06', $pos['for_date'], 'column 7 is the day the sales were made');
        $this->assertSame('pos', $pos['kind']);
        $this->assertSame(57519, $pos['amount_laar']);
        $this->assertSame('POS Credit Transfer · terminal 000000 65018311', $pos['description']);
        $this->assertMatchesRegularExpression('/^FT26\d{8}\\\\B26$/', $pos['reference'], 'the ="…" wrapper is stripped');

        $transfer = $parsed['lines'][2];
        $this->assertSame('2026-08-11', $transfer['txn_date']);
        $this->assertSame('2026-08-10', $transfer['for_date'], 'column 5 is when the customer sent it');
        $this->assertSame('transfer', $transfer['kind']);
        $this->assertSame('ASIF MOOSA IBRAHIM', $transfer['counterparty']);
        $this->assertSame(200000, $transfer['amount_laar']);
    }

    public function test_credits_that_are_not_pos_settlements_are_set_aside_in_the_card_account(): void
    {
        $this->payment('card', 100, $this->day(2), 0);
        $csv = implode("\n", [
            $this->bmlPos($this->day(1), $this->day(2), 100.00),
            // The owner topping the account up from their own account.
            $this->bmlTransfer($this->day(1), $this->day(1), 'ASIF MOOSA IBRAHIM', 2000),
            '',
        ]);
        $file = UploadedFile::fake()->createWithContent('card.csv', $csv);

        $res = $this->postJson('/api/settlements/statements', ['account' => 'card_qr', 'file' => $file])
            ->assertCreated()
            ->assertJsonPath('summary.format', 'bml')
            ->assertJsonPath('summary.new_lines', 2)
            ->assertJsonPath('summary.set_aside_lines', 1)
            ->assertJsonPath('summary.credit_total_laar', 10000)
            ->json('summary');
        $this->assertTrue($res['preview'][1]['set_aside']);

        $ledger = $this->getJson('/api/settlements/card-qr?from=' . $this->day(3) . '&to=' . $this->day(0))->assertOk()->json();
        $this->assertSame('settled', collect($ledger['days'])->firstWhere('date', $this->day(2))['status']);
        $this->assertSame(0, $ledger['totals']['excess_laar'], 'the top-up is not an unexplained deposit');
        $this->assertCount(1, $ledger['set_aside']);
        $this->assertSame(200000, $ledger['set_aside'][0]['amount_laar']);

        // A person can say it was a settlement after all.
        $this->postJson('/api/settlements/lines/' . $ledger['set_aside'][0]['id'] . '/restore')->assertOk();
        $ledger = $this->getJson('/api/settlements/card-qr?from=' . $this->day(3) . '&to=' . $this->day(0))->assertOk()->json();
        $this->assertCount(0, $ledger['set_aside']);
        $this->assertSame('over', collect($ledger['days'])->firstWhere('date', $this->day(1))['status']);
    }

    public function test_uploading_a_statement_stores_credits_once_however_often_it_is_uploaded(): void
    {
        $csv = "Date,Description,Credit\n" . $this->day(1) . ",POS SETTLEMENT,150.00\n" . $this->day(1) . ",POS SETTLEMENT,150.00\n";
        $file = fn () => UploadedFile::fake()->createWithContent('sept.csv', $csv);

        // A look first: nothing stored.
        $this->postJson('/api/settlements/statements', ['account' => 'card_qr', 'file' => $file(), 'dry_run' => 1])
            ->assertOk()
            ->assertJsonPath('dry_run', true)
            ->assertJsonPath('summary.new_lines', 2);
        $this->assertSame(0, BankStatementLine::count());

        $this->postJson('/api/settlements/statements', ['account' => 'card_qr', 'file' => $file()])
            ->assertCreated()
            ->assertJsonPath('summary.new_lines', 2)
            ->assertJsonPath('summary.credit_total_laar', 30000);
        // Two identical lines in one file are two deposits.
        $this->assertSame(2, BankStatementLine::count());

        // The same file again adds nothing.
        $this->postJson('/api/settlements/statements', ['account' => 'card_qr', 'file' => $file()])
            ->assertCreated()
            ->assertJsonPath('summary.new_lines', 0)
            ->assertJsonPath('summary.duplicate_lines', 2);
        $this->assertSame(2, BankStatementLine::count());
    }

    public function test_an_unreadable_file_is_refused_with_a_reason(): void
    {
        $file = UploadedFile::fake()->createWithContent('notes.csv', "just some words\nno columns here\n");
        $this->postJson('/api/settlements/statements', ['account' => 'card_qr', 'file' => $file])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'No header row found — the file needs a date column and a credit or amount column.']);
    }

    // ── transfers ────────────────────────────────────────────────────────────

    public function test_a_transfer_line_is_matched_to_the_only_payment_of_that_amount_or_by_reference(): void
    {
        $lone = $this->payment('bank_transfer', 250, $this->day(1), 0, 'TRF001');
        $line = $this->line('transfer', 250.00, $this->day(0), 'IB TRANSFER 4402');
        $this->assertSame('auto', app(SettlementLedgerService::class)->autoMatchTransfer($line));
        $this->assertSame($lone->id, $line->fresh()->matched_payment_id);

        // Two of the same amount: only the one whose reference is in the narration.
        $a = $this->payment('bank_transfer', 80, $this->day(1), 0, 'ABCD1');
        $b = $this->payment('bank_transfer', 80, $this->day(1), 0, 'WXYZ9');
        $ambiguous = $this->line('transfer', 80.00, $this->day(0), 'TRANSFER ref WXYZ9');
        $this->assertSame('auto', app(SettlementLedgerService::class)->autoMatchTransfer($ambiguous));
        $this->assertSame($b->id, $ambiguous->fresh()->matched_payment_id);

        // Nothing to go on: left for a person.
        $this->payment('bank_transfer', 30, $this->day(1), 0);
        $this->payment('bank_transfer', 30, $this->day(1), 0);
        $blank = $this->line('transfer', 30.00, $this->day(0), 'TRANSFER');
        $this->assertSame('unmatched', app(SettlementLedgerService::class)->autoMatchTransfer($blank));

        $view = $this->getJson('/api/settlements/transfers?from=' . $this->day(2) . '&to=' . $this->day(0))->assertOk()->json();
        $this->assertSame(5, $view['totals']['payments']);
        $this->assertSame(2, $view['totals']['verified']);
        $this->assertSame(1, $view['totals']['unmatched_lines']);
        $this->assertSame(14000, $view['totals']['unverified_laar'], 'the 80 without a matching reference and the two 30s');
        $this->assertTrue(collect($view['payments'])->firstWhere('payment_id', $a->id)['verified'] === false);
    }

    public function test_a_wrong_amount_transfer_is_linked_to_its_sale_and_the_difference_shown(): void
    {
        // Owner, 2026-09-07: "Some customers transfer wrong amounts. That
        // should be tallied tracked. Add a way to highlight mismatches."
        $azlifa = $this->payment('bank_transfer', 26, $this->day(1), 0);
        $azlifa->order->update(['customer_id' => $this->makeCustomer(['name' => 'Azlifa Ahmed'])->id]);
        $aiman = $this->payment('bank_transfer', 180, $this->day(1), 0);
        $aiman->order->update(['customer_id' => $this->makeCustomer(['name' => 'Aiman Shareef'])->id]);
        $maisham = $this->payment('bank_transfer', 71, $this->day(1), 0);
        $maisham->order->update(['customer_id' => $this->makeCustomer(['name' => 'Fathimath Maisham'])->id]);

        // Azlifa sent 20 for a 26 sale; Aiman sent exactly 180; Maisham sent
        // 75, and the bank does not know the name on the sale.
        $csv = implode("\n", [
            $this->bmlTransfer($this->day(0), $this->day(1), 'AZLIFA AHMED', 20),
            $this->bmlTransfer($this->day(0), $this->day(1), 'AIMAN SHAREEF', 180),
            $this->bmlTransfer($this->day(0), $this->day(1), 'F MAISHAM HOUSEHOLD', 75),
            $this->bmlTransfer($this->day(0), $this->day(1), 'I PROPERTY LLP', null, 64),
            '',
        ]);
        $file = UploadedFile::fake()->createWithContent('transfer.csv', $csv);

        $this->postJson('/api/settlements/statements', ['account' => 'transfer', 'file' => $file])
            ->assertCreated()
            ->assertJsonPath('summary.new_lines', 3)
            ->assertJsonPath('summary.debit_lines_skipped', 1)
            ->assertJsonPath('summary.auto_matched', 1)
            ->assertJsonPath('summary.mismatched', 2);

        $view = $this->getJson('/api/settlements/transfers?from=' . $this->day(2) . '&to=' . $this->day(0))->assertOk()->json();
        $rows = collect($view['payments'])->keyBy('payment_id');
        $this->assertSame('short', $rows[$azlifa->id]['status']);
        $this->assertSame(-600, $rows[$azlifa->id]['difference_laar']);
        $this->assertSame('AZLIFA AHMED', $rows[$azlifa->id]['line']['counterparty']);
        $this->assertSame('verified', $rows[$aiman->id]['status']);
        $this->assertSame(0, $rows[$aiman->id]['difference_laar']);
        // Name did not match, but it was the only sale left that day and the only credit left for it.
        $this->assertSame('over', $rows[$maisham->id]['status']);
        $this->assertSame(400, $rows[$maisham->id]['difference_laar']);

        $this->assertSame(1, $view['totals']['verified']);
        $this->assertSame(2, $view['totals']['mismatched']);
        $this->assertSame(600, $view['totals']['short_laar']);
        $this->assertSame(400, $view['totals']['over_laar']);
        $this->assertSame(0, $view['totals']['unverified_laar']);
        $this->assertSame(0, $view['totals']['unmatched_lines']);
    }

    public function test_a_wrong_amount_credit_is_not_guessed_when_two_sales_could_claim_it(): void
    {
        $this->payment('bank_transfer', 26, $this->day(1), 0);
        $this->payment('bank_transfer', 30, $this->day(1), 0);
        $line = $this->line('transfer', 20.00, $this->day(0), 'Transfer Credit · SOMEONE', $this->day(1), 'transfer');

        $this->assertSame('unmatched', app(SettlementLedgerService::class)->autoMatchTransfer($line, true));
    }

    public function test_a_person_can_match_a_line_by_hand_and_set_a_stray_credit_aside(): void
    {
        $p = $this->payment('bank_transfer', 30, $this->day(1), 0);
        $line = $this->line('transfer', 30.00, $this->day(0), 'TRANSFER');
        $stray = $this->line('transfer', 12.00, $this->day(0), 'INTEREST');

        $this->postJson("/api/settlements/lines/{$line->id}/match", ['payment_id' => $p->id])->assertOk()->assertJsonPath('line.match_status', 'manual');
        $this->postJson("/api/settlements/lines/{$stray->id}/ignore")->assertOk()->assertJsonPath('line.match_status', 'ignored');

        $card = $this->payment('card', 30, $this->day(1), 0);
        $this->postJson("/api/settlements/lines/{$line->id}/match", ['payment_id' => $card->id])->assertStatus(422);
    }

    // ── cash ─────────────────────────────────────────────────────────────────

    public function test_cash_handed_over_is_compared_to_the_count_less_the_float(): void
    {
        $today = $this->day(0);
        [$start] = BusinessDay::bounds($today);
        Shift::create([
            'user_id' => $this->owner->id,
            'device_id' => $this->makeDevice()->id,
            'opened_at' => $start->copy()->addHours(8),
            'closed_at' => $start->copy()->addHours(20),
            'opening_cash' => 500,
            'closing_cash' => 2300,
            'expected_cash' => 2250,
            'variance' => 50,
        ]);

        // Float stays in the drawer: the owner should receive 2300 − 500.
        $this->putJson("/api/settlements/cash/{$today}", ['amount' => 1800])
            ->assertOk()
            ->assertJsonPath('day.expected_handover_laar', 180000)
            ->assertJsonPath('day.received_laar', 180000)
            ->assertJsonPath('day.status', 'settled')
            ->assertJsonPath('day.till_variance_laar', 5000);

        // The owner took more out and left 300 as tomorrow's float.
        $this->putJson("/api/settlements/cash/{$today}", ['amount' => 1800, 'float_kept' => 300])
            ->assertOk()
            ->assertJsonPath('day.expected_handover_laar', 200000)
            ->assertJsonPath('day.difference_laar', -20000)
            ->assertJsonPath('day.status', 'differs');

        $days = $this->getJson('/api/settlements/cash?from=' . $today . '&to=' . $today)->assertOk()->json('days');
        $this->assertSame('entered', $days[0]['float_source']);
    }

    // ── access ───────────────────────────────────────────────────────────────

    public function test_staff_without_the_permission_cannot_see_settlements(): void
    {
        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);
        $this->getJson('/api/settlements/card-qr')->assertForbidden();
    }
}
