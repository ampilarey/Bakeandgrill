<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Shift;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReportsController extends Controller
{
    public function salesSummary(Request $request)
    {
        [$from, $to] = $this->parseRange($request);

        $orders = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed');

        $totals = [
            'orders_count' => $orders->count(),
            'subtotal' => $orders->sum('subtotal'),
            'tax_amount' => $orders->sum('tax_amount'),
            'discount_amount' => $orders->sum('discount_amount'),
            'total' => $orders->sum('total'),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->get()
            ->groupBy('method')
            ->map(fn ($group) => $group->sum('amount'));

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => $totals,
            'payments' => $payments,
        ]);
    }

    public function salesSummaryCsv(Request $request)
    {
        $data = $this->salesSummary($request)->getData(true);
        $rows = [
            ['metric', 'value'],
            ['from', $data['from']],
            ['to', $data['to']],
            ['orders_count', $data['totals']['orders_count'] ?? 0],
            ['subtotal', $data['totals']['subtotal'] ?? 0],
            ['tax_amount', $data['totals']['tax_amount'] ?? 0],
            ['discount_amount', $data['totals']['discount_amount'] ?? 0],
            ['total', $data['totals']['total'] ?? 0],
        ];

        $rows[] = [];
        $rows[] = ['payment_method', 'amount'];
        foreach ($data['payments'] ?? [] as $method => $amount) {
            $rows[] = [$method, $amount];
        }

        return $this->csvResponse('sales-summary.csv', $rows);
    }

    public function salesBreakdown(Request $request)
    {
        [$from, $to] = $this->parseRange($request);

        $items = OrderItem::select(
                'item_id',
                'item_name',
                DB::raw('SUM(quantity) as quantity'),
                DB::raw('SUM(total_price) as total')
            )
            ->whereHas('order', function ($query) use ($from, $to) {
                $query->whereBetween('created_at', [$from, $to])
                    ->where('status', 'completed');
            })
            ->groupBy('item_id', 'item_name')
            ->orderByDesc('total')
            ->get();

        $categories = OrderItem::select(
                'categories.id as category_id',
                'categories.name as category_name',
                DB::raw('SUM(order_items.quantity) as quantity'),
                DB::raw('SUM(order_items.total_price) as total')
            )
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->join('categories', 'categories.id', '=', 'items.category_id')
            ->whereHas('order', function ($query) use ($from, $to) {
                $query->whereBetween('created_at', [$from, $to])
                    ->where('status', 'completed');
            })
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('total')
            ->get();

        $employees = Order::leftJoin('users', 'users.id', '=', 'orders.user_id')
            ->select(
                'orders.user_id',
                'users.name',
                DB::raw('COUNT(*) as orders_count'),
                DB::raw('SUM(orders.total) as total')
            )
            ->whereBetween('orders.created_at', [$from, $to])
            ->where('orders.status', 'completed')
            ->groupBy('orders.user_id', 'users.name')
            ->orderByDesc('total')
            ->get()
            ->map(function ($row) {
                return [
                    'user_id' => $row->user_id,
                    'name' => $row->name,
                    'orders_count' => (int) $row->orders_count,
                    'total' => (float) $row->total,
                ];
            });

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'items' => $items,
            'categories' => $categories,
            'employees' => $employees,
        ]);
    }

    public function salesBreakdownCsv(Request $request)
    {
        $data = $this->salesBreakdown($request)->getData(true);
        $rows = [
            ['section', 'id', 'name', 'quantity', 'total'],
        ];

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
        $shift = Shift::where('user_id', $request->user()?->id)
            ->whereNull('closed_at')
            ->latest('opened_at')
            ->first();

        if (!$shift) {
            return response()->json(['message' => 'No active shift.'], 422);
        }

        $from = $shift->opened_at;
        $to = now();

        $orders = Order::where('user_id', $shift->user_id)
            ->whereBetween('created_at', [$from, $to])
            ->where('status', 'completed');

        $totals = [
            'orders_count' => $orders->count(),
            'subtotal' => $orders->sum('subtotal'),
            'tax_amount' => $orders->sum('tax_amount'),
            'discount_amount' => $orders->sum('discount_amount'),
            'total' => $orders->sum('total'),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->whereHas('order', function ($query) use ($shift) {
                $query->where('user_id', $shift->user_id);
            })
            ->get()
            ->groupBy('method')
            ->map(fn ($group) => $group->sum('amount'));

        $refundsTotal = Refund::whereBetween('created_at', [$from, $to])
            ->whereHas('order', function ($query) use ($shift) {
                $query->where('user_id', $shift->user_id);
            })
            ->sum('amount');

        return response()->json([
            'shift' => $shift,
            'from' => $from->toDateTimeString(),
            'to' => $to->toDateTimeString(),
            'totals' => $totals,
            'payments' => $payments,
            'refunds' => $refundsTotal,
        ]);
    }

    public function xReportCsv(Request $request)
    {
        $data = $this->xReport($request)->getData(true);
        $rows = [
            ['metric', 'value'],
            ['from', $data['from']],
            ['to', $data['to']],
            ['orders_count', $data['totals']['orders_count'] ?? 0],
            ['subtotal', $data['totals']['subtotal'] ?? 0],
            ['tax_amount', $data['totals']['tax_amount'] ?? 0],
            ['discount_amount', $data['totals']['discount_amount'] ?? 0],
            ['total', $data['totals']['total'] ?? 0],
            ['refunds', $data['refunds'] ?? 0],
        ];

        $rows[] = [];
        $rows[] = ['payment_method', 'amount'];
        foreach ($data['payments'] ?? [] as $method => $amount) {
            $rows[] = [$method, $amount];
        }

        return $this->csvResponse('x-report.csv', $rows);
    }

    public function zReport(Request $request)
    {
        [$from, $to] = $this->parseRange($request);

        $orders = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed');

        $totals = [
            'orders_count' => $orders->count(),
            'subtotal' => $orders->sum('subtotal'),
            'tax_amount' => $orders->sum('tax_amount'),
            'discount_amount' => $orders->sum('discount_amount'),
            'total' => $orders->sum('total'),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->get()
            ->groupBy('method')
            ->map(fn ($group) => $group->sum('amount'));

        $refunds = Refund::whereBetween('created_at', [$from, $to])
            ->sum('amount');

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => $totals,
            'payments' => $payments,
            'refunds' => $refunds,
        ]);
    }

    public function zReportCsv(Request $request)
    {
        $data = $this->zReport($request)->getData(true);
        $rows = [
            ['metric', 'value'],
            ['from', $data['from']],
            ['to', $data['to']],
            ['orders_count', $data['totals']['orders_count'] ?? 0],
            ['subtotal', $data['totals']['subtotal'] ?? 0],
            ['tax_amount', $data['totals']['tax_amount'] ?? 0],
            ['discount_amount', $data['totals']['discount_amount'] ?? 0],
            ['total', $data['totals']['total'] ?? 0],
            ['refunds', $data['refunds'] ?? 0],
        ];

        $rows[] = [];
        $rows[] = ['payment_method', 'amount'];
        foreach ($data['payments'] ?? [] as $method => $amount) {
            $rows[] = [$method, $amount];
        }

        return $this->csvResponse('z-report.csv', $rows);
    }

    public function inventoryValuation()
    {
        $totals = InventoryItem::select(
                DB::raw('SUM(COALESCE(current_stock, 0) * COALESCE(unit_cost, 0)) as value'),
                DB::raw('SUM(COALESCE(current_stock, 0)) as quantity')
            )
            ->first();

        return response()->json([
            'value' => (float) ($totals->value ?? 0),
            'quantity' => (float) ($totals->quantity ?? 0),
        ]);
    }

    public function inventoryValuationCsv()
    {
        $data = $this->inventoryValuation()->getData(true);
        $rows = [
            ['metric', 'value'],
            ['value', $data['value'] ?? 0],
            ['quantity', $data['quantity'] ?? 0],
        ];

        return $this->csvResponse('inventory-valuation.csv', $rows);
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

    private function parseRange(Request $request): array
    {
        $from = $request->query('from')
            ? Carbon::parse($request->query('from'))->startOfDay()
            : now()->startOfDay();
        $to = $request->query('to')
            ? Carbon::parse($request->query('to'))->endOfDay()
            : now()->endOfDay();

        if ($to->lessThan($from)) {
            throw ValidationException::withMessages([
                'to' => ['End date must be after start date.'],
            ]);
        }

        if ($to->diffInDays($from) > 365) {
            throw ValidationException::withMessages([
                'from' => ['Date range cannot exceed 365 days.'],
            ]);
        }

        return [$from, $to];
    }
}
