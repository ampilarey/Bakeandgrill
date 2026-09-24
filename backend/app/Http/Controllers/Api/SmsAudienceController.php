<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\Services\BulkSmsService;
use App\Domains\Notifications\Support\SmsAudienceCriteria;
use App\Http\Controllers\Controller;
use App\Models\SmsAudience;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Saved campaign audiences (SMS audit, 2026-09-24).
 * GET/POST /admin/sms/audiences, PATCH/DELETE /admin/sms/audiences/{audience}
 */
class SmsAudienceController extends Controller
{
    public function __construct(private BulkSmsService $bulkSms) {}

    public function index(): JsonResponse
    {
        $audiences = SmsAudience::query()->with('creator:id,name')->orderBy('name')->get()
            ->map(fn (SmsAudience $a) => $this->format($a))
            ->values();

        return response()->json([
            'audiences' => $audiences,
            'order_types' => SmsAudienceCriteria::ORDER_TYPES,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('sms_audiences', 'name')],
            'description' => 'nullable|string|max:300',
            ...SmsAudienceCriteria::rules('criteria'),
        ]);
        $criteria = SmsAudienceCriteria::clean($validated['criteria'] ?? []);
        unset($criteria['audience_id']); // an audience is not built on another one

        $audience = SmsAudience::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'criteria' => $criteria,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json(['audience' => $this->format($audience->fresh('creator'))], 201);
    }

    public function update(Request $request, SmsAudience $audience): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100', Rule::unique('sms_audiences', 'name')->ignore($audience->id)],
            'description' => 'nullable|string|max:300',
            ...SmsAudienceCriteria::rules('criteria'),
        ]);
        $data = [];
        if (array_key_exists('name', $validated)) {
            $data['name'] = $validated['name'];
        }
        if (array_key_exists('description', $validated)) {
            $data['description'] = $validated['description'];
        }
        if (array_key_exists('criteria', $validated)) {
            $criteria = SmsAudienceCriteria::clean($validated['criteria'] ?? []);
            unset($criteria['audience_id']);
            $data['criteria'] = $criteria;
        }
        $audience->update($data);

        return response()->json(['audience' => $this->format($audience->fresh('creator'))]);
    }

    public function destroy(SmsAudience $audience): JsonResponse
    {
        $audience->delete();

        return response()->json(['ok' => true]);
    }

    /** @return array<string, mixed> */
    private function format(SmsAudience $a): array
    {
        $criteria = (array) ($a->criteria ?? []);

        return [
            'id' => $a->id,
            'name' => $a->name,
            'description' => $a->description,
            'criteria' => $criteria,
            'summary' => SmsAudienceCriteria::describe($criteria),
            'count' => $this->bulkSms->audienceCount($criteria),
            'created_by_name' => $a->creator?->name,
            'updated_at' => $a->updated_at?->toIso8601String(),
        ];
    }
}
