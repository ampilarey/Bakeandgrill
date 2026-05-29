<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Customers\Services\CustomerActivityService;
use App\Domains\Customers\Services\CustomerDataQualityService;
use App\Domains\Customers\Services\CustomerGrowthSummaryService;
use App\Domains\Customers\Services\CustomerMetricsService;
use App\Domains\Customers\Services\CustomerSegmentationService;
use App\Domains\Customers\Services\CustomerSmsActionService;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerFollowUpNote;
use App\Models\CustomerTag;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminCustomerGrowthController extends Controller
{
    public function __construct(
        private readonly CustomerMetricsService $metrics,
        private readonly CustomerSegmentationService $segments,
        private readonly CustomerActivityService $activity,
        private readonly CustomerDataQualityService $dataQuality,
        private readonly CustomerGrowthSummaryService $summary,
        private readonly CustomerSmsActionService $smsAction,
    ) {}

    public function metrics(): JsonResponse
    {
        return response()->json(['metrics' => $this->metrics->dashboard()]);
    }

    public function listSegments(): JsonResponse
    {
        return response()->json(['segments' => $this->segments->listSegments()]);
    }

    public function segmentCustomers(Request $request, string $segment): JsonResponse
    {
        $paginator = $this->segments->customersInSegment($segment, [
            'search' => $request->query('search'),
            'page' => $request->integer('page', 1),
            'per_page' => $request->integer('per_page', 30),
        ]);

        return response()->json([
            'segment' => $segment,
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function dataQuality(): JsonResponse
    {
        return response()->json(['report' => $this->dataQuality->report()]);
    }

    public function growthSummary(Request $request, int $id): JsonResponse
    {
        $customer = Customer::withCount('orders')->findOrFail($id);
        $includeCredit = $request->user()?->hasPermission('customers.credit.manage') ?? false;

        return response()->json([
            'summary' => $this->summary->summary($customer, $includeCredit),
        ]);
    }

    public function activity(int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);

        return response()->json([
            'timeline' => $this->activity->timeline($customer, 100),
        ]);
    }

    public function attachTag(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $validated = $request->validate([
            'tag_id' => 'nullable|integer|exists:customer_tags,id',
            'name' => 'nullable|string|max:50',
            'color' => 'nullable|string|max:20',
        ]);

        if (empty($validated['tag_id']) && empty($validated['name'])) {
            return response()->json(['message' => 'Provide tag_id or name.'], 422);
        }

        $tag = isset($validated['tag_id'])
            ? CustomerTag::findOrFail($validated['tag_id'])
            : CustomerTag::firstOrCreate(
                ['name' => $validated['name']],
                ['color' => $validated['color'] ?? '#6B7280'],
            );

        $customer->tags()->syncWithoutDetaching([
            $tag->id => ['assigned_by' => $request->user()?->id],
        ]);

        return response()->json([
            'message' => 'Tag assigned.',
            'tags' => $customer->fresh('tags')->tags->map(fn ($t) => [
                'id' => $t->id,
                'name' => $t->name,
                'color' => $t->color,
            ]),
        ]);
    }

    public function detachTag(int $id, int $tag): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $customer->tags()->detach($tag);

        return response()->json(['message' => 'Tag removed.']);
    }

    public function followUpNote(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $validated = $request->validate([
            'note' => 'required|string|max:2000',
            'follow_up_at' => 'nullable|date',
        ]);

        $note = CustomerFollowUpNote::create([
            'customer_id' => $customer->id,
            'staff_id' => $request->user()?->id,
            'note' => $validated['note'],
            'follow_up_at' => $validated['follow_up_at'] ?? null,
        ]);

        return response()->json([
            'message' => 'Follow-up note saved.',
            'note' => [
                'id' => $note->id,
                'note' => $note->note,
                'follow_up_at' => $note->follow_up_at?->toIso8601String(),
                'created_at' => $note->created_at?->toIso8601String(),
            ],
        ], 201);
    }

    public function sendSms(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $validated = $request->validate([
            'message' => 'required|string|max:500',
        ]);

        /** @var User $staff */
        $staff = $request->user();
        $log = $this->smsAction->sendDirect($customer, $validated['message'], $staff);

        return response()->json([
            'message' => 'SMS sent.',
            'sms_log' => [
                'id' => $log->id,
                'status' => $log->status,
            ],
        ]);
    }
}
