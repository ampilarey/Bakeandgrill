<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Reporting\Services\ReportsService;
use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Thin HTTP layer — delegates all query logic to ReportsService.
 * To change how a report is calculated, edit ReportsService; never add queries here.
 */
class ReportsController extends Controller
{
    public function __construct(private readonly ReportsService $reports) {}

    public function salesSummary(Request $request)
    {
        [$from, $to] = $this->parseRange($request);
        $filters = $this->parsePosFilters($request);

        return response()->json($this->reports->salesSummary(
            $from,
            $to,
            $filters['user_id'],
            $filters['shift_id'],
            $filters['device_id'],
        ));
    }

    public function salesSummaryCsv(Request $request)
    {
        [$from, $to] = $this->parseRange($request);
        $data = $this->reports->salesSummary($from, $to);

        $rows = [
            ['metric', 'value'],
            ['from', $data['from']],
            ['to', $data['to']],
            ['orders_count', $data['totals']['orders_count'] ?? 0],
            ['subtotal', $data['totals']['subtotal'] ?? 0],
            ['tax_amount', $data['totals']['tax_amount'] ?? 0],
            ['discount_amount', $data['totals']['discount_amount'] ?? 0],
            ['service_charge_total', $data['totals']['service_charge_total'] ?? 0],
            ['total', $data['totals']['total'] ?? 0],
            [],
            ['payment_method', 'amount'],
        ];
        foreach ($data['payments'] ?? [] as $method => $amount) {
            $rows[] = [$method, $amount];
        }

        return $this->csvResponse('sales-summary.csv', $rows);
    }

    public function salesBreakdown(Request $request)
    {
        [$from, $to] = $this->parseRange($request);
        $limit = min((int) $request->input('limit', 100), 500);

        return response()->json($this->reports->salesBreakdown($from, $to, $limit));
    }

    public function salesBreakdownCsv(Request $request)
    {
        [$from, $to] = $this->parseRange($request);
        $data = $this->reports->salesBreakdown($from, $to);

        $rows = [['section', 'id', 'name', 'quantity', 'total']];
        foreach ($data['items'] ?? [] as $item) {
            $rows[] = ['items', $item['item_id'] ?? '', $item['item_name'] ?? '', $item['quantity'] ?? 0, $item['total'] ?? 0];
        }
        $rows[] = [];
        foreach ($data['categories'] ?? [] as $category) {
            $rows[] = ['categories', $category['category_id'] ?? '', $category['category_name'] ?? '', $category['quantity'] ?? 0, $category['total'] ?? 0];
        }
        $rows[] = [];
        foreach ($data['employees'] ?? [] as $employee) {
            $rows[] = ['employees', $employee['user_id'] ?? '', $employee['name'] ?? '', $employee['orders_count'] ?? 0, $employee['total'] ?? 0];
        }

        return $this->csvResponse('sales-breakdown.csv', $rows);
    }

    public function xReport(Request $request)
    {
        $userId = $request->user()?->id;
        $data = $this->reports->xReport($userId);

        if ($data === null) {
            return response()->json(['message' => 'No active shift.'], 422);
        }

        return response()->json($data);
    }

    public function xReportCsv(Request $request)
    {
        $userId = $request->user()?->id;
        $data = $this->reports->xReport($userId);

        if ($data === null) {
            return response()->json(['message' => 'No active shift.'], 422);
        }

        $rows = [
            ['metric', 'value'],
            ['from', $data['from']],
            ['to', $data['to']],
            ['orders_count', $data['totals']['orders_count'] ?? 0],
            ['subtotal', $data['totals']['subtotal'] ?? 0],
            ['tax_amount', $data['totals']['tax_amount'] ?? 0],
            ['discount_amount', $data['totals']['discount_amount'] ?? 0],
            ['service_charge_total', $data['totals']['service_charge_total'] ?? 0],
            ['total', $data['totals']['total'] ?? 0],
            ['refunds', $data['refunds'] ?? 0],
            [],
            ['payment_method', 'amount'],
        ];
        foreach ($data['payments'] ?? [] as $method => $amount) {
            $rows[] = [$method, $amount];
        }

        return $this->csvResponse('x-report.csv', $rows);
    }

    public function zReport(Request $request)
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json($this->reports->zReport($from, $to));
    }

    public function zReportCsv(Request $request)
    {
        [$from, $to] = $this->parseRange($request);
        $data = $this->reports->zReport($from, $to);

        $rows = [
            ['metric', 'value'],
            ['from', $data['from']],
            ['to', $data['to']],
            ['orders_count', $data['totals']['orders_count'] ?? 0],
            ['subtotal', $data['totals']['subtotal'] ?? 0],
            ['tax_amount', $data['totals']['tax_amount'] ?? 0],
            ['discount_amount', $data['totals']['discount_amount'] ?? 0],
            ['service_charge_total', $data['totals']['service_charge_total'] ?? 0],
            ['total', $data['totals']['total'] ?? 0],
            ['refunds', $data['refunds'] ?? 0],
            [],
            ['payment_method', 'amount'],
        ];
        foreach ($data['payments'] ?? [] as $method => $amount) {
            $rows[] = [$method, $amount];
        }

        return $this->csvResponse('z-report.csv', $rows);
    }

    public function inventoryValuation()
    {
        return response()->json($this->reports->inventoryValuation());
    }

    public function deliveryZones(Request $request)
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json($this->reports->deliveryZones($from, $to));
    }

    public function discountsByType(Request $request)
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json($this->reports->discountsByType($from, $to));
    }

    public function voidsByStaff(Request $request)
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json($this->reports->voidsByStaff($from, $to));
    }

    public function refundsByReason(Request $request)
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json($this->reports->refundsByReason($from, $to));
    }

    public function creditExposure()
    {
        return response()->json($this->reports->creditExposure());
    }

    public function managerOverrides(Request $request)
    {
        [$from, $to] = $this->parseRange($request);
        $limit = min(200, max(10, (int) $request->input('limit', 100)));

        return response()->json($this->reports->managerOverrides($from, $to, $limit));
    }

    public function stockVelocity(Request $request)
    {
        [$from, $to] = $this->parseRange($request);
        $limit = min(100, max(10, (int) $request->input('limit', 50)));

        return response()->json($this->reports->stockVelocity($from, $to, $limit));
    }

    public function driverSettlement(Request $request)
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json($this->reports->driverSettlement($from, $to));
    }

    public function shiftVariances(Request $request)
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json($this->reports->shiftVariances($from, $to));
    }

    public function customerLtv(Request $request)
    {
        $limit = min(50, max(5, (int) $request->input('limit', 20)));

        return response()->json($this->reports->customerLtvTop($limit));
    }

    public function inventoryValuationCsv()
    {
        $data = $this->reports->inventoryValuation();
        $rows = [
            ['metric', 'value'],
            ['value', $data['value'] ?? 0],
            ['quantity', $data['quantity'] ?? 0],
        ];

        return $this->csvResponse('inventory-valuation.csv', $rows);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function parseRange(Request $request): array
    {
        try {
            $from = $request->query('from')
                ? Carbon::createFromFormat('Y-m-d', $request->query('from'))->startOfDay()
                : now()->startOfDay();
            $to = $request->query('to')
                ? Carbon::createFromFormat('Y-m-d', $request->query('to'))->endOfDay()
                : now()->endOfDay();
        } catch (\Throwable) {
            throw ValidationException::withMessages(['from' => ['Invalid date format. Use YYYY-MM-DD.']]);
        }

        if ($to->lessThan($from)) {
            throw ValidationException::withMessages(['to' => ['End date must be after start date.']]);
        }

        if ($to->diffInDays($from) > 365) {
            throw ValidationException::withMessages(['from' => ['Date range cannot exceed 365 days.']]);
        }

        return [$from, $to];
    }

    /** @return array{user_id: ?int, shift_id: ?int, device_id: ?int} */
    private function parsePosFilters(Request $request): array
    {
        return [
            'user_id' => $request->filled('user_id') ? (int) $request->input('user_id') : null,
            'shift_id' => $request->filled('shift_id') ? (int) $request->input('shift_id') : null,
            'device_id' => $request->filled('device_id') ? (int) $request->input('device_id') : null,
        ];
    }

    private function csvResponse(string $filename, array $rows)
    {
        $handle = fopen('php://temp', 'r+');
        foreach ($rows as $row) {
            $sanitized = array_map([$this, 'sanitizeCsvValue'], $row);
            fputcsv($handle, $sanitized);
        }
        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    private function sanitizeCsvValue($value): string
    {
        if ($value === null) {
            return '';
        }
        if (is_numeric($value)) {
            return (string) $value;
        }
        $string = (string) $value;
        if (preg_match('/^[=+\\-@]/', $string)) {
            return "'" . $string;
        }

        return $string;
    }
}
