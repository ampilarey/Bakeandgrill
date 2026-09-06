<?php

declare(strict_types=1);

namespace App\Domains\Finance\Services;

use Carbon\Carbon;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

/**
 * Reads a bank statement file (CSV, XLS, XLSX) into credit lines.
 *
 * Banks do not agree on column names, so the header row is found by looking
 * for familiar words ("date", "description", "credit", "balance") in the
 * first twenty rows, and the money column is whichever of credit / amount
 * the file has. Debits are dropped: only money coming in settles a sale.
 *
 * Nothing here is bank-specific. A statement that cannot be read comes back
 * with a plain reason rather than a guess.
 */
final class BankStatementParser
{
    private const HEADERS = [
        'date' => ['transaction date', 'txn date', 'value date', 'posting date', 'date'],
        'description' => ['description', 'narration', 'narrative', 'details', 'particulars', 'remarks', 'transaction details', 'memo'],
        'reference' => ['reference', 'ref no', 'ref', 'transaction id', 'txn id', 'cheque no', 'cheque'],
        'credit' => ['credit', 'deposit', 'cr amount', 'credit amount', 'money in', 'paid in', 'cr'],
        'debit' => ['debit', 'withdrawal', 'dr amount', 'debit amount', 'money out', 'paid out', 'dr'],
        'amount' => ['amount', 'transaction amount', 'txn amount'],
        'balance' => ['balance', 'running balance', 'closing balance'],
    ];

    /**
     * @return array{
     *   lines: list<array{txn_date: string, description: ?string, reference: ?string, amount_laar: int, balance_laar: ?int}>,
     *   columns: array<string, int>,
     *   debit_count: int,
     *   unreadable_count: int,
     *   error: ?string
     * }
     */
    public function parse(string $path, ?string $originalName = null): array
    {
        try {
            $reader = IOFactory::createReaderForFile($path);
            if (method_exists($reader, 'setReadDataOnly')) {
                $reader->setReadDataOnly(true);
            }
            if ($reader instanceof \PhpOffice\PhpSpreadsheet\Reader\Csv) {
                // The library guesses the delimiter from the first lines, and a
                // statement opens with a title line that has none. Count them
                // over the whole file instead.
                $reader->setDelimiter($this->sniffDelimiter($path));
            }
            $sheet = $reader->load($path)->getSheet(0);
            $rows = $sheet->toArray(null, true, false, false);
        } catch (\Throwable $e) {
            return $this->failure('That file could not be read as a spreadsheet or CSV' . ($originalName ? " ({$originalName})" : '') . '.');
        }

        [$headerIndex, $columns] = $this->findHeader($rows);
        if ($headerIndex === null) {
            return $this->failure('No header row found — the file needs a date column and a credit or amount column.');
        }
        if (!isset($columns['date']) || (!isset($columns['credit']) && !isset($columns['amount']))) {
            return $this->failure('The header row has no date column, or no credit/amount column.');
        }

        $lines = [];
        $debits = 0;
        $unreadable = 0;
        for ($i = $headerIndex + 1; $i < count($rows); $i++) {
            $row = $rows[$i];
            if (!is_array($row) || $this->rowIsBlank($row)) {
                continue;
            }

            $date = $this->parseDate($row[$columns['date']] ?? null);
            if ($date === null) {
                $unreadable++;

                continue;
            }

            $amountLaar = $this->creditLaar($row, $columns);
            if ($amountLaar === null) {
                $unreadable++;

                continue;
            }
            if ($amountLaar <= 0) {
                $debits++;

                continue;
            }

            $lines[] = [
                'txn_date' => $date,
                'description' => $this->text($row[$columns['description'] ?? -1] ?? null, 500),
                'reference' => $this->text($row[$columns['reference'] ?? -1] ?? null, 120),
                'amount_laar' => $amountLaar,
                'balance_laar' => isset($columns['balance']) ? $this->moneyLaar($row[$columns['balance']] ?? null) : null,
            ];
        }

        return [
            'lines' => $lines,
            'columns' => $columns,
            'debit_count' => $debits,
            'unreadable_count' => $unreadable,
            'error' => null,
        ];
    }

    /**
     * @param list<mixed> $rows
     * @return array{0: ?int, 1: array<string, int>}
     */
    private function findHeader(array $rows): array
    {
        $limit = min(20, count($rows));
        for ($i = 0; $i < $limit; $i++) {
            $row = $rows[$i];
            if (!is_array($row)) {
                continue;
            }
            $columns = [];
            foreach ($row as $col => $cell) {
                $label = strtolower(trim((string) $cell));
                if ($label === '') {
                    continue;
                }
                foreach (self::HEADERS as $key => $words) {
                    if (isset($columns[$key])) {
                        continue;
                    }
                    foreach ($words as $word) {
                        if ($label === $word || str_starts_with($label, $word . ' ') || str_starts_with($label, $word . '(') || str_ends_with($label, ' ' . $word)) {
                            $columns[$key] = (int) $col;

                            continue 3;
                        }
                    }
                }
            }
            if (isset($columns['date']) && (isset($columns['credit']) || isset($columns['amount']))) {
                return [$i, $columns];
            }
        }

        return [null, []];
    }

    /** @param array<string, int> $columns */
    private function creditLaar(array $row, array $columns): ?int
    {
        if (isset($columns['credit'])) {
            $credit = $this->moneyLaar($row[$columns['credit']] ?? null);
            $debit = isset($columns['debit']) ? $this->moneyLaar($row[$columns['debit']] ?? null) : null;
            if ($credit === null && $debit === null) {
                // A row with neither is unreadable only if it has no amount either.
                if (isset($columns['amount'])) {
                    return $this->signedAmount($row[$columns['amount']] ?? null);
                }

                return null;
            }
            if ($credit !== null && $credit > 0) {
                return $credit;
            }

            // A debit row, or a zero — not a credit.
            return 0;
        }

        return $this->signedAmount($row[$columns['amount']] ?? null);
    }

    /** One amount column: sign or a CR/DR suffix says which way the money went. */
    private function signedAmount(mixed $cell): ?int
    {
        $raw = strtolower(trim((string) $cell));
        if ($raw === '') {
            return null;
        }
        $isDebit = str_ends_with($raw, 'dr') || str_ends_with($raw, ' debit');
        $laar = $this->moneyLaar($cell);
        if ($laar === null) {
            return null;
        }
        if ($isDebit) {
            return -abs($laar);
        }

        return $laar;
    }

    private function moneyLaar(mixed $cell): ?int
    {
        if ($cell === null) {
            return null;
        }
        if (is_int($cell) || is_float($cell)) {
            return (int) round((float) $cell * 100);
        }
        $s = trim((string) $cell);
        if ($s === '' || $s === '-') {
            return null;
        }
        $negative = str_starts_with($s, '(') && str_ends_with($s, ')') || str_starts_with($s, '-');
        $s = preg_replace('/[^0-9.]/', '', $s) ?? '';
        if ($s === '' || !is_numeric($s)) {
            return null;
        }
        $laar = (int) round((float) $s * 100);

        return $negative ? -$laar : $laar;
    }

    private function parseDate(mixed $cell): ?string
    {
        if ($cell === null || $cell === '') {
            return null;
        }
        if (is_int($cell) || is_float($cell)) {
            // Excel serial. Anything below 20000 (mid-1954) is not a modern statement date.
            if ($cell > 20000 && $cell < 80000) {
                try {
                    return ExcelDate::excelToDateTimeObject((float) $cell)->format('Y-m-d');
                } catch (\Throwable) {
                    return null;
                }
            }

            return null;
        }

        $s = trim((string) $cell);
        if ($s === '') {
            return null;
        }
        // Drop a time part; the day is what matters.
        $s = preg_replace('/\s+\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i', '', $s) ?? $s;

        foreach (['d/m/Y', 'd-m-Y', 'd.m.Y', 'Y-m-d', 'Y/m/d', 'd M Y', 'd-M-Y', 'd M, Y', 'j M Y', 'd/m/y', 'd-m-y', 'M d, Y', 'd F Y'] as $format) {
            try {
                $d = Carbon::createFromFormat($format, $s);
                if ($d !== false && $d->year >= 2000 && $d->year <= 2100) {
                    return $d->format('Y-m-d');
                }
            } catch (\Throwable) {
                // try the next shape
            }
        }

        return null;
    }

    private function sniffDelimiter(string $path): string
    {
        $head = (string) file_get_contents($path, false, null, 0, 65536);
        $counts = [',' => substr_count($head, ','), ';' => substr_count($head, ';'), "\t" => substr_count($head, "\t"), '|' => substr_count($head, '|')];
        arsort($counts);

        return (string) array_key_first($counts);
    }

    private function text(mixed $cell, int $max): ?string
    {
        $s = trim((string) ($cell ?? ''));

        return $s === '' ? null : mb_substr($s, 0, $max);
    }

    /** @param array<int, mixed> $row */
    private function rowIsBlank(array $row): bool
    {
        foreach ($row as $cell) {
            if ($cell !== null && trim((string) $cell) !== '') {
                return false;
            }
        }

        return true;
    }

    private function failure(string $why): array
    {
        return ['lines' => [], 'columns' => [], 'debit_count' => 0, 'unreadable_count' => 0, 'error' => $why];
    }
}
