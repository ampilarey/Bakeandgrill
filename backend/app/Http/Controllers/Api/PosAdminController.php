<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Device;
use App\Models\Order;
use App\Models\Refund;
use App\Models\Shift;
use App\Models\TimePunch;
use App\Models\User;
use App\Services\AdminMaintenanceService;
use App\Services\PermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PosAdminController extends Controller
{
    public function __construct(
        private readonly PermissionService $permissions,
        private readonly AdminMaintenanceService $maintenance,
    ) {}

    /** GET /api/admin/pos/overview — live POS control-room snapshot */
    public function overview(Request $request): JsonResponse
    {
        $today = now()->toDateString();

        $openShifts = Shift::query()
            ->whereNull('closed_at')
            ->with(['user:id,name', 'device:id,name,identifier'])
            ->orderByDesc('opened_at')
            ->get()
            ->map(fn (Shift $s) => [
                'id' => $s->id,
                'user_id' => $s->user_id,
                'user_name' => $s->user?->name,
                'device_id' => $s->device_id,
                'device_name' => $s->device?->name,
                'device_identifier' => $s->device?->identifier,
                'opened_at' => $s->opened_at,
                'opening_cash' => (float) ($s->opening_cash ?? 0),
            ]);

        $activeTickets = Order::query()
            ->whereNotIn('status', ['cancelled', 'refunded', 'completed', 'payment_pending'])
            ->count();

        $pendingDevices = Device::where('status', 'pending')->count();

        $todayVoids = AuditLog::whereDate('created_at', $today)
            ->where(function ($q) {
                $q->where('action', 'order.cancelled')
                    ->orWhere('action', 'like', '%void%');
            })
            ->count();

        $todayRefunds = Refund::whereDate('created_at', $today)
            ->whereNotIn('status', ['rejected'])
            ->count();

        $clockedIn = TimePunch::query()
            ->whereNull('clocked_out_at')
            ->with('user:id,name')
            ->orderByDesc('clocked_in_at')
            ->get()
            ->map(fn (TimePunch $p) => [
                'user_id' => $p->user_id,
                'user_name' => $p->user?->name,
                'clocked_in_at' => $p->clocked_in_at,
            ]);

        $recentActivity = AuditLog::query()
            ->with('user:id,name')
            ->whereIn('action', [
                'order.created', 'order.paid', 'order.cancelled', 'order.held', 'order.resumed',
                'shift.opened', 'shift.closed', 'shift.force_closed',
                'payment.created', 'device.approved', 'device.rejected',
            ])
            ->orderByDesc('created_at')
            ->limit(8)
            ->get()
            ->map(fn (AuditLog $log) => [
                'id' => $log->id,
                'action' => $log->action,
                'user_name' => $log->user?->name,
                'model_type' => $log->model_type,
                'model_id' => $log->model_id,
                'created_at' => $log->created_at,
            ]);

        return response()->json([
            'open_shifts_count' => $openShifts->count(),
            'open_shifts' => $openShifts,
            'active_tickets' => $activeTickets,
            'pending_devices' => $pendingDevices,
            'today_voids' => $todayVoids,
            'today_refunds' => $todayRefunds,
            'clocked_in_count' => $clockedIn->count(),
            'clocked_in' => $clockedIn,
            'recent_activity' => $recentActivity,
        ]);
    }

    /** GET /api/admin/pos/staff-options — staff list for report filters */
    public function staffOptions(): JsonResponse
    {
        $staff = User::query()
            ->where('is_active', true)
            ->whereHas('role')
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json(['staff' => $staff]);
    }

    /** GET /api/admin/pos/maintenance-preview — stale tickets/shifts snapshot (owner) */
    public function maintenancePreview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'older_than_days' => 'sometimes|integer|min:1|max:90',
        ]);

        $days = (int) ($validated['older_than_days'] ?? 1);

        return response()->json($this->maintenance->preview($days));
    }

    /** POST /api/admin/pos/cleanup-stale-tickets — bulk void unpaid stale open tickets (owner) */
    public function cleanupStaleTickets(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'older_than_days' => 'required|integer|min:1|max:90',
            'confirm' => 'required|accepted',
        ]);

        $result = $this->maintenance->cleanupStaleOpenTickets(
            (int) $validated['older_than_days'],
            (int) $request->user()->id,
            $request,
        );

        return response()->json([
            'message' => "Cancelled {$result['cancelled_count']} stale ticket(s).",
            ...$result,
        ]);
    }
}
