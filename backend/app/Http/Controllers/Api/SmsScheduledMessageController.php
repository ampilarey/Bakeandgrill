<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Sms\Services\SmsSchedulerService;
use App\Http\Controllers\Controller;
use App\Models\SmsScheduledMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SmsScheduledMessageController extends Controller
{
    public function __construct(
        private readonly SmsSchedulerService $scheduler,
    ) {}

    public function index(): JsonResponse
    {
        $messages = SmsScheduledMessage::with(['contact:id,name,phone', 'group:id,name', 'template:id,name,slug', 'creator:id,name'])
            ->orderByDesc('created_at')
            ->paginate(50);

        return response()->json([
            'data' => $messages->map(fn ($m) => $this->format($m)),
            'meta' => ['total' => $messages->total(), 'last_page' => $messages->lastPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'to_type' => 'required|in:contact,group,phone',
            'to_contact_id' => 'required_if:to_type,contact|nullable|exists:sms_contacts,id',
            'to_group_id' => 'required_if:to_type,group|nullable|exists:sms_contact_groups,id',
            'to_phone' => 'required_if:to_type,phone|nullable|string|max:20',
            'template_id' => 'nullable|exists:sms_templates,id',
            'body' => 'nullable|string',
            'variables' => 'nullable|array',
            'is_recurring' => 'boolean',
            'recurrence_type' => 'nullable|required_if:is_recurring,true|in:daily,weekly,monthly',
            'recurrence_days' => 'nullable|array',
            'recurrence_days.*' => 'in:mon,tue,wed,thu,fri,sat,sun',
            'recurrence_time' => 'nullable|required_if:is_recurring,true|date_format:H:i',
            'recurrence_day_of_month' => 'nullable|integer|min:1|max:28',
            'send_at' => 'nullable|required_if:is_recurring,false|date',
        ]);

        $data['created_by'] = $request->user()->id;
        $data['status'] = 'active';

        $message = SmsScheduledMessage::create($data);
        $this->scheduler->initializeNextSendAt($message);
        $message->load(['contact', 'group', 'template', 'creator']);

        return response()->json(['message' => $this->format($message)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $message = SmsScheduledMessage::findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'to_type' => 'sometimes|in:contact,group,phone',
            'to_contact_id' => 'nullable|exists:sms_contacts,id',
            'to_group_id' => 'nullable|exists:sms_contact_groups,id',
            'to_phone' => 'nullable|string|max:20',
            'template_id' => 'nullable|exists:sms_templates,id',
            'body' => 'nullable|string',
            'variables' => 'nullable|array',
            'is_recurring' => 'sometimes|boolean',
            'recurrence_type' => 'nullable|in:daily,weekly,monthly',
            'recurrence_days' => 'nullable|array',
            'recurrence_days.*' => 'in:mon,tue,wed,thu,fri,sat,sun',
            'recurrence_time' => 'nullable|date_format:H:i',
            'recurrence_day_of_month' => 'nullable|integer|min:1|max:28',
            'send_at' => 'nullable|date',
        ]);

        $message->update($data);

        // Re-initialize next_send_at if timing changed
        if (array_key_exists('send_at', $data) || array_key_exists('recurrence_time', $data)) {
            $this->scheduler->initializeNextSendAt($message);
        }

        $message->load(['contact', 'group', 'template', 'creator']);

        return response()->json(['message' => $this->format($message)]);
    }

    public function destroy(int $id): JsonResponse
    {
        $message = SmsScheduledMessage::findOrFail($id);
        $message->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Scheduled message cancelled.']);
    }

    public function pause(int $id): JsonResponse
    {
        $message = SmsScheduledMessage::findOrFail($id);
        $message->update(['status' => 'paused']);

        return response()->json(['message' => 'Scheduled message paused.']);
    }

    public function resume(int $id): JsonResponse
    {
        $message = SmsScheduledMessage::findOrFail($id);
        $message->update(['status' => 'active']);

        return response()->json(['message' => 'Scheduled message resumed.']);
    }

    private function format(SmsScheduledMessage $m): array
    {
        return [
            'id' => $m->id,
            'name' => $m->name,
            'to_type' => $m->to_type,
            'to_contact_id' => $m->to_contact_id,
            'to_contact_name' => $m->contact?->name,
            'to_group_id' => $m->to_group_id,
            'to_group_name' => $m->group?->name,
            'to_phone' => $m->to_phone,
            'template_id' => $m->template_id,
            'template_name' => $m->template?->name,
            'body' => $m->body,
            'variables' => $m->variables,
            'is_recurring' => $m->is_recurring,
            'recurrence_type' => $m->recurrence_type,
            'recurrence_days' => $m->recurrence_days,
            'recurrence_time' => $m->recurrence_time,
            'recurrence_day_of_month' => $m->recurrence_day_of_month,
            'send_at' => $m->send_at?->toIso8601String(),
            'next_send_at' => $m->next_send_at?->toIso8601String(),
            'last_sent_at' => $m->last_sent_at?->toIso8601String(),
            'status' => $m->status,
            'created_by_name' => $m->creator?->name,
            'created_at' => $m->created_at?->toIso8601String(),
        ];
    }
}
