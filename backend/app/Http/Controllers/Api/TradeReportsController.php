<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Trade\Services\TradeAnalyticsService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;

class TradeReportsController extends Controller
{
    public function __construct(
        private readonly TradeAnalyticsService $analytics,
    ) {}

    public function sellThrough(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $this->analytics->sellThrough($from, $to),
        ]);
    }

    public function suggestedQuantities(): JsonResponse
    {
        return response()->json([
            'rows' => $this->analytics->suggestedQuantities(),
        ]);
    }

    public function waste(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $this->analytics->wasteCost($from, $to),
        ]);
    }

    public function margins(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $this->analytics->marginsByShop($from, $to),
        ]);
    }

    public function ageing(): JsonResponse
    {
        return response()->json([
            'rows' => $this->analytics->ageingReceivables(),
        ]);
    }

    public function exceptions(Request $request): JsonResponse
    {
        $days = (int) $request->query('older_than_days', 3);
        $days = max(1, min(90, $days));

        return response()->json($this->analytics->leakLists($days));
    }

    public function sellThroughCsv(Request $request): Response
    {
        [$from, $to] = $this->parseRange($request);
        $rows = $this->analytics->sellThrough($from, $to);

        return $this->csvResponse('trade-sell-through', [
            'shop_name', 'item_name', 'qty_sent', 'qty_sold', 'qty_returned_good',
            'qty_wasted', 'qty_missing', 'sell_through_pct',
        ], $rows);
    }

    public function suggestedQuantitiesCsv(): Response
    {
        $rows = $this->analytics->suggestedQuantities();

        return $this->csvResponse('trade-suggested-qty', [
            'shop_name', 'item_name', 'deliveries_count', 'average_sold',
            'suggested_qty', 'status', 'message',
        ], $rows);
    }

    public function wasteCsv(Request $request): Response
    {
        [$from, $to] = $this->parseRange($request);
        $rows = $this->analytics->wasteCost($from, $to);

        return $this->csvResponse('trade-waste', [
            'shop_name', 'item_name', 'qty_wasted', 'waste_cost',
        ], $rows);
    }

    public function marginsCsv(Request $request): Response
    {
        [$from, $to] = $this->parseRange($request);
        $rows = $this->analytics->marginsByShop($from, $to);

        return $this->csvResponse('trade-margins', [
            'shop_name', 'revenue', 'cogs', 'waste_cost', 'margin',
        ], $rows);
    }

    public function ageingCsv(): Response
    {
        $rows = $this->analytics->ageingReceivables();

        return $this->csvResponse('trade-ageing', [
            'shop_name', 'current', 'days_1_30', 'days_31_60', 'days_60_plus',
            'outstanding', 'credit_limit', 'exposure',
        ], $rows);
    }

    public function exceptionsCsv(Request $request): Response
    {
        $days = (int) $request->query('older_than_days', 3);
        $data = $this->analytics->leakLists(max(1, min(90, $days)));
        $rows = [];
        foreach ($data['unreconciled'] as $r) {
            $rows[] = [
                'list' => 'unreconciled',
                'delivery_number' => $r['delivery_number'],
                'shop_name' => $r['shop_name'],
                'dispatched_at' => $r['dispatched_at'],
                'days_outstanding' => $r['days_outstanding'],
            ];
        }
        foreach ($data['mismatches'] as $r) {
            $rows[] = [
                'list' => 'mismatch',
                'delivery_number' => $r['delivery_number'],
                'shop_name' => $r['shop_name'],
                'dispatched_at' => $r['reconciled_at'],
                'days_outstanding' => '',
            ];
        }

        return $this->csvResponse('trade-exceptions', [
            'list', 'delivery_number', 'shop_name', 'dispatched_at', 'days_outstanding',
        ], $rows);
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function parseRange(Request $request): array
    {
        $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $from = Carbon::parse($request->query('from', now()->startOfMonth()->toDateString()))->startOfDay();
        $to = Carbon::parse($request->query('to', now()->toDateString()))->endOfDay();
        if ($from->gt($to)) {
            throw ValidationException::withMessages(['from' => ['From date must be on or before to date.']]);
        }
        if ($from->diffInDays($to) > 366) {
            throw ValidationException::withMessages(['to' => ['Range cannot exceed 366 days.']]);
        }

        return [$from, $to];
    }

    /**
     * @param  list<string>  $headers
     * @param  list<array<string, mixed>>  $rows
     */
    private function csvResponse(string $name, array $headers, array $rows): Response
    {
        $escape = static function ($v): string {
            $s = $v === null ? '' : (string) $v;
            if (str_contains($s, ',') || str_contains($s, '"') || str_contains($s, "\n")) {
                return '"'.str_replace('"', '""', $s).'"';
            }

            return $s;
        };

        $lines = [implode(',', $headers)];
        foreach ($rows as $row) {
            $lines[] = implode(',', array_map(
                fn ($h) => $escape($row[$h] ?? ''),
                $headers,
            ));
        }

        return response(implode("\n", $lines)."\n", 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$name.'-'.now()->toDateString().'.csv"',
        ]);
    }
}
