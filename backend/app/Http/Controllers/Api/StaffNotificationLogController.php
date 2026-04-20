<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Http\Controllers\Controller;
use App\Models\StaffNotificationLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffNotificationLogController extends Controller
{
    /** GET /admin/sms/staff-logs */
    public function index(Request $request): JsonResponse
    {
        $query = StaffNotificationLog::with('order:id,order_number,type')
            ->orderByDesc('created_at');

        if ($request->filled('order_id')) {
            $query->where('order_id', $request->integer('order_id'));
        }

        if ($request->filled('event_type')) {
            $query->where('event_type', $request->string('event_type'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        $logs = $query->paginate(50);

        return response()->json([
            'data' => $logs->map(fn ($l) => $this->format($l)),
            'meta' => ['total' => $logs->total(), 'last_page' => $logs->lastPage()],
        ]);
    }

    /** POST /admin/sms/staff-logs/{id}/resend */
    public function resend(int $id, SmsService $smsService): JsonResponse
    {
        $log = StaffNotificationLog::findOrFail($id);

        if ($log->status === 'sent') {
            return response()->json(['message' => 'Already sent.'], 422);
        }

        try {
            $smsLog = $smsService->send(new SmsMessage(
                to: $log->phone,
                message: $log->message,
                type: 'staff_notification',
                referenceType: 'order',
                referenceId: (string) $log->order_id,
            ));

            $log->update([
                'status'     => $smsLog->status === 'sent' ? 'sent' : 'failed',
                'sms_log_id' => $smsLog->id,
                'sent_at'    => $smsLog->status === 'sent' ? now() : null,
                'failed_at'  => $smsLog->status !== 'sent' ? now() : null,
            ]);

            return response()->json(['message' => 'Resent successfully.', 'log' => $this->format($log->fresh())]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Failed to resend: ' . $e->getMessage()], 500);
        }
    }

    private function format(StaffNotificationLog $l): array
    {
        return [
            'id'             => $l->id,
            'order_id'       => $l->order_id,
            'order_number'   => $l->order?->order_number,
            'order_type'     => $l->order?->type,
            'event_type'     => $l->event_type,
            'recipient_type' => $l->recipient_type,
            'recipient_id'   => $l->recipient_id,
            'phone'          => $l->phone,
            'message'        => $l->message,
            'status'         => $l->status,
            'fallback_used'  => $l->fallback_used,
            'sms_log_id'     => $l->sms_log_id,
            'sent_at'        => $l->sent_at?->toIso8601String(),
            'failed_at'      => $l->failed_at?->toIso8601String(),
            'created_at'     => $l->created_at?->toIso8601String(),
        ];
    }
}
