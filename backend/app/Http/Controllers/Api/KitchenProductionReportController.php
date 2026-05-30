<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KitchenProductionBatch;
use App\Models\KitchenProductionVariance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class KitchenProductionReportController extends Controller
{
    public function productionSummary(Request $request): JsonResponse
    {
        $from = $request->query('from', now()->startOfDay()->toDateString());
        $to = $request->query('to', now()->endOfDay()->toDateString());

        $batches = KitchenProductionBatch::whereBetween('created_at', [$from, $to . ' 23:59:59'])->count();
        $submitted = KitchenProductionBatch::where('status', 'submitted')->count();
        $received = KitchenProductionBatch::where('status', 'received')->whereBetween('updated_at', [$from, $to . ' 23:59:59'])->count();
        $waste = KitchenProductionVariance::where('variance_type', 'waste')->whereBetween('created_at', [$from, $to . ' 23:59:59'])->count();
        $remakes = KitchenProductionVariance::where('variance_type', 'remake')->whereBetween('created_at', [$from, $to . ' 23:59:59'])->count();

        return response()->json([
            'summary' => [
                'batches_created' => $batches,
                'pending_receive' => $submitted,
                'received' => $received,
                'waste_count' => $waste,
                'remake_count' => $remakes,
            ],
            'from' => $from,
            'to' => $to,
        ]);
    }

    public function handoverReport(Request $request): JsonResponse
    {
        $rows = DB::table('kitchen_production_batches as b')
            ->join('orders as o', 'o.id', '=', 'b.order_id')
            ->whereNotNull('b.order_id')
            ->whereNotNull('b.submitted_at')
            ->select([
                'b.id', 'b.batch_no', 'o.order_number', 'b.submitted_at',
                'o.kitchen_done_at', 'o.pos_received_at', 'o.kitchen_handover_status',
            ])
            ->orderByDesc('b.submitted_at')
            ->limit(100)
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function wasteReport(Request $request): JsonResponse
    {
        $rows = KitchenProductionVariance::with(['batch', 'recorder'])
            ->whereIn('variance_type', ['waste', 'remake', 'rejected'])
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->map(fn (KitchenProductionVariance $v) => [
                'id' => $v->id,
                'type' => $v->variance_type,
                'qty' => (float) $v->qty,
                'reason' => $v->reason,
                'staff' => $v->recorder?->name,
                'batch_no' => $v->batch?->batch_no,
                'created_at' => $v->created_at?->toIso8601String(),
            ]);

        return response()->json(['data' => $rows]);
    }

    public function staffOutput(Request $request): JsonResponse
    {
        $rows = DB::table('kitchen_production_batches')
            ->join('users', 'users.id', '=', 'kitchen_production_batches.produced_by')
            ->select('users.name', DB::raw('count(*) as batch_count'))
            ->groupBy('users.id', 'users.name')
            ->orderByDesc('batch_count')
            ->limit(20)
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function posReceivingReport(Request $request): JsonResponse
    {
        $rows = DB::table('kitchen_receiving_batches as rb')
            ->join('users', 'users.id', '=', 'rb.received_by')
            ->join('kitchen_production_batches as pb', 'pb.id', '=', 'rb.kitchen_production_batch_id')
            ->select('users.name', 'rb.received_at', 'rb.status', 'pb.batch_no', 'rb.receive_location')
            ->orderByDesc('rb.received_at')
            ->limit(100)
            ->get();

        return response()->json(['data' => $rows]);
    }
}
