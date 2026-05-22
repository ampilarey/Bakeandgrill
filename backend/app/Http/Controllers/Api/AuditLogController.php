<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /** GET /api/admin/audit-logs */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'nullable|integer|exists:users,id',
            'action' => 'nullable|string|max:100',
            'model_type' => 'nullable|string|max:100',
            'model_id' => 'nullable|integer',
            'from' => 'nullable|date_format:Y-m-d',
            'to' => 'nullable|date_format:Y-m-d',
            'q' => 'nullable|string|max:200',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:10|max:100',
        ]);

        $query = AuditLog::query()
            ->with(['user:id,name,email'])
            ->orderByDesc('created_at');

        if (!empty($validated['user_id'])) {
            $query->where('user_id', $validated['user_id']);
        }
        if (!empty($validated['action'])) {
            $query->where('action', 'like', '%' . $validated['action'] . '%');
        }
        if (!empty($validated['model_type'])) {
            $query->where('model_type', $validated['model_type']);
        }
        if (!empty($validated['model_id'])) {
            $query->where('model_id', $validated['model_id']);
        }
        if (!empty($validated['from'])) {
            $query->whereDate('created_at', '>=', $validated['from']);
        }
        if (!empty($validated['to'])) {
            $query->whereDate('created_at', '<=', $validated['to']);
        }
        if (!empty($validated['q'])) {
            $q = $validated['q'];
            $query->where(function ($w) use ($q) {
                $w->where('action', 'like', "%{$q}%")
                    ->orWhere('model_type', 'like', "%{$q}%")
                    ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$q}%"));
            });
        }

        $perPage = min(100, max(10, (int) ($validated['per_page'] ?? 30)));

        return response()->json($query->paginate($perPage));
    }

    /** GET /api/admin/audit-logs/actions — distinct action slugs for filter dropdown */
    public function actions(): JsonResponse
    {
        $actions = AuditLog::query()
            ->select('action')
            ->distinct()
            ->orderBy('action')
            ->pluck('action');

        return response()->json(['actions' => $actions]);
    }
}
