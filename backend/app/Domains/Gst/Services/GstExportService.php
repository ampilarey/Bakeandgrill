<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class GstExportService
{
    public function __construct(
        private readonly GstReportService $reports = new GstReportService,
        private readonly GstTaxCalculator $tax = new GstTaxCalculator,
    ) {}

    /** @return list<string> */
    public function validateOutputExport(string $period): array
    {
        $summary = $this->reports->summary($period);
        $errors = [];

        if (empty($summary['business_tin'])) {
            $errors[] = 'Seller TIN is required before export.';
        }
        if (empty($summary['taxable_activity_no'])) {
            $errors[] = 'Taxable activity number is required before export.';
        }

        foreach ($summary['warnings'] as $warning) {
            if (in_array($warning['type'], ['tax_invoice_missing_tin', 'unposted_order'], true)) {
                $errors[] = $warning['message'];
            }
        }

        return $errors;
    }

    public function outputStatementXlsx(string $period): string
    {
        $errors = $this->validateOutputExport($period);
        if ($errors !== []) {
            throw new \RuntimeException(implode(' ', $errors));
        }

        $data = $this->reports->outputStatement($period);
        $spreadsheet = new Spreadsheet();

        $sheet1 = $spreadsheet->getActiveSheet();
        $sheet1->setTitle('TaxInvoices');
        $headers1 = [
            'Customer TIN', 'Customer Name', 'Invoice No.', 'Invoice Date',
            'Value of Supplies Subject to GST at 8%',
            'Value of Zero-Rated Supplies', 'Value of Exempt Supplies',
            'Value of Out-of-Scope Supplies', 'Your Taxable Activity No.',
        ];
        $sheet1->fromArray($headers1, null, 'A1');

        $row = 2;
        foreach ($data['tax_invoices'] as $inv) {
            $sheet1->fromArray([
                $inv['customer_tin'],
                $inv['customer_name'],
                $inv['invoice_no'],
                $inv['invoice_date'],
                $this->tax->laarToMvr((int) $inv['standard_8_laar']),
                $this->tax->laarToMvr((int) $inv['zero_rated_laar']),
                $this->tax->laarToMvr((int) $inv['exempt_laar']),
                $this->tax->laarToMvr((int) $inv['out_of_scope_laar']),
                $inv['taxable_activity_no'],
            ], null, 'A' . $row);
            $row++;
        }

        $sheet2 = $spreadsheet->createSheet();
        $sheet2->setTitle('OtherTransactions');
        $headers2 = [
            'Your Taxable Activity No.',
            'Value of Supplies Subject to GST at 8%',
            'Value of Zero-Rated Supplies', 'Value of Exempt Supplies',
            'Value of Out-of-Scope Supplies',
        ];
        $sheet2->fromArray($headers2, null, 'A1');

        $other = $data['other_transactions'][0] ?? [];
        $sheet2->fromArray([
            $other['taxable_activity_no'] ?? '',
            $this->tax->laarToMvr((int) ($other['standard_8_laar'] ?? 0)),
            $this->tax->laarToMvr((int) ($other['zero_rated_laar'] ?? 0)),
            $this->tax->laarToMvr((int) ($other['exempt_laar'] ?? 0)),
            $this->tax->laarToMvr((int) ($other['out_of_scope_laar'] ?? 0)),
        ], null, 'A2');

        $path = storage_path('app/gst/output-' . $period . '-' . time() . '.xlsx');
        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }
        (new Xlsx($spreadsheet))->save($path);

        return $path;
    }

    public function inputStatementXlsx(string $period): string
    {
        $data = $this->reports->inputStatement($period);
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Input Tax Statement');

        $headers = [
            '#', 'Supplier TIN', 'Supplier Name', 'Supplier Invoice Number', 'Invoice Date',
            'Invoice Total excluding GST', 'GST charged at 6%', 'GST charged at 8%',
            'GST charged at 12%', 'GST charged at 16%', 'Your Taxable Activity Number',
            'Revenue / Capital',
        ];
        $sheet->fromArray($headers, null, 'A1');

        $row = 2;
        $i = 1;
        foreach ($data['rows'] as $r) {
            $sheet->fromArray([
                $i++,
                $r['supplier_tin'],
                $r['supplier_name'],
                $r['supplier_invoice_no'],
                $r['invoice_date'],
                $this->tax->laarToMvr((int) $r['total_ex_gst_laar']),
                $this->tax->laarToMvr((int) $r['gst_6_laar']),
                $this->tax->laarToMvr((int) $r['gst_8_laar']),
                $this->tax->laarToMvr((int) $r['gst_12_laar']),
                $this->tax->laarToMvr((int) $r['gst_16_laar']),
                $r['taxable_activity_no'],
                ucfirst((string) $r['revenue_or_capital']),
            ], null, 'A' . $row);
            $row++;
        }

        $path = storage_path('app/gst/input-' . $period . '-' . time() . '.xlsx');
        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }
        (new Xlsx($spreadsheet))->save($path);

        return $path;
    }

    public function summaryCsv(string $period): string
    {
        $summary = $this->reports->summary($period);
        $path = storage_path('app/gst/summary-' . $period . '.csv');
        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }

        $fh = fopen($path, 'w');
        fputcsv($fh, ['Field', 'Value MVR']);
        foreach ($summary as $key => $value) {
            if (is_array($value)) {
                continue;
            }
            if (str_ends_with($key, '_laar')) {
                fputcsv($fh, [$key, $this->tax->laarToMvr((int) $value)]);
            } else {
                fputcsv($fh, [$key, is_scalar($value) ? (string) $value : json_encode($value)]);
            }
        }
        fclose($fh);

        return $path;
    }

    public function ledgerCsv(string $period): string
    {
        $data = $this->reports->ledger($period, 1);
        $path = storage_path('app/gst/ledger-' . $period . '.csv');
        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }

        $fh = fopen($path, 'w');
        fputcsv($fh, [
            'document_no', 'document_date', 'source_type', 'direction', 'tax_code',
            'taxable_value_mvr', 'tax_mvr', 'total_mvr', 'is_tax_invoice', 'is_claimable',
        ]);

        foreach ($data['data'] as $entry) {
            fputcsv($fh, [
                $entry->document_no,
                $entry->document_date?->toDateString(),
                $entry->source_type,
                $entry->direction,
                $entry->tax_code,
                $this->tax->laarToMvr((int) $entry->taxable_value_laar),
                $this->tax->laarToMvr((int) $entry->tax_laar),
                $this->tax->laarToMvr((int) $entry->total_laar),
                $entry->is_tax_invoice ? 'yes' : 'no',
                $entry->is_claimable ? 'yes' : 'no',
            ]);
        }
        fclose($fh);

        return $path;
    }
}
