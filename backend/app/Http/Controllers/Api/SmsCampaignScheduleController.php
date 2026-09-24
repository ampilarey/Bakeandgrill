<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\Services\BulkSmsService;
use App\Domains\Notifications\Support\SmsAudienceCriteria;
use App\Domains\Sms\Services\SmsSchedulerService;
use App\Http\Controllers\Controller;
use App\Models\SmsCampaignSchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Recurring campaigns (SMS audit follow-up, 2026-09-24).
 * /admin/sms/campaign-schedules
 */
class SmsCampaignScheduleController extends Controller
{
    public function __construct(private BulkSmsService $bulkSms, private SmsSchedulerService $scheduler) {}

    public function index(): JsonResponse
    {
        $schedules = SmsCampaignSchedule::query()
            ->withCount('campaigns')
            ->with(['campaigns' => fn ($q) => $q->orderByDesc('id')->limit(1)])
            ->orderBy('name')
            ->get()
            ->map(fn (SmsCampaignSchedule $s) => $this->format($s))
            ->values();

        return response()->json(['schedules' => $schedules]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());
        $schedule = SmsCampaignSchedule::create([
            ...$this->attributes($validated),
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'created_by' => $request->user()?->id,
        ]);
        $schedule->update(['next_run_at' => $schedule->computeNextRunAt(now())]);

        return response()->json(['schedule' => $this->format($schedule->fresh())], 201);
    }

    public function update(Request $request, SmsCampaignSchedule $schedule): JsonResponse
    {
        $validated = $request->validate($this->rules(true));
        $schedule->fill($this->attributes($validated));
        if (array_key_exists('is_active', $validated)) {
            $schedule->is_active = (bool) $validated['is_active'];
        }
        $schedule->save();
        // A changed time or day, or a schedule switched back on, starts from the next slot.
        $schedule->update(['next_run_at' => $schedule->is_active ? $schedule->computeNextRunAt(now()) : null]);

        return response()->json(['schedule' => $this->format($schedule->fresh())]);
    }

    public function destroy(SmsCampaignSchedule $schedule): JsonResponse
    {
        $schedule->delete(); // past runs keep their campaign rows; schedule_id goes null

        return response()->json(['ok' => true]);
    }

    /** POST …/{schedule}/run — run it now, outside the timetable. */
    public function run(SmsCampaignSchedule $schedule): JsonResponse
    {
        $campaign = $this->scheduler->runSchedule($schedule);
        $schedule->update(['last_run_at' => now(), 'runs_count' => $schedule->runs_count + 1]);

        return response()->json([
            'campaign' => $campaign,
            'message' => $campaign->status === 'cancelled'
                ? (string) ($campaign->notes ?: 'Nobody to text this time.')
                : "Sent to {$campaign->total_recipients} recipient" . ($campaign->total_recipients === 1 ? '' : 's') . '.',
        ], $campaign->status === 'cancelled' ? 422 : 200);
    }

    /** @return array<string, mixed> */
    private function rules(bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return [
            'name' => "{$req}|string|max:100",
            'message' => "{$req}|string|max:1600",
            'recipe_key' => 'nullable|string|max:40',
            'frequency' => [$req, Rule::in(SmsCampaignSchedule::FREQUENCIES)],
            'days_of_week' => 'nullable|array|max:7',
            'days_of_week.*' => Rule::in(SmsCampaignSchedule::DAYS),
            'day_of_month' => 'nullable|integer|min:1|max:31',
            'send_time' => [$req, 'string', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'cooldown_days' => 'nullable|integer|min:1|max:3650',
            'is_active' => 'nullable|boolean',
            ...SmsAudienceCriteria::rules('target_criteria'),
        ];
    }

    /** @param array<string, mixed> $v @return array<string, mixed> */
    private function attributes(array $v): array
    {
        $out = [];
        foreach (['name', 'message', 'recipe_key', 'frequency', 'days_of_week', 'day_of_month', 'send_time', 'cooldown_days'] as $k) {
            if (array_key_exists($k, $v)) {
                $out[$k] = $v[$k];
            }
        }
        if (array_key_exists('target_criteria', $v)) {
            $criteria = SmsAudienceCriteria::clean($v['target_criteria'] ?? []);
            unset($criteria['schedule_id'], $criteria['cooldown_days']); // set per run
            $out['target_criteria'] = $criteria;
        }
        if (isset($out['cooldown_days'])) {
            $out['cooldown_days'] = max(1, (int) $out['cooldown_days']);
        }

        return $out;
    }

    /** @return array<string, mixed> */
    private function format(SmsCampaignSchedule $s): array
    {
        $criteria = (array) ($s->target_criteria ?? []);
        $last = $s->relationLoaded('campaigns') ? $s->campaigns->first() : $s->campaigns()->orderByDesc('id')->first();

        return [
            'id' => $s->id,
            'name' => $s->name,
            'message' => $s->message,
            'recipe_key' => $s->recipe_key,
            'target_criteria' => $criteria,
            'audience_summary' => SmsAudienceCriteria::describe($this->bulkSms->effectiveCriteria($criteria)),
            'frequency' => $s->frequency,
            'days_of_week' => $s->days_of_week,
            'day_of_month' => $s->day_of_month,
            'send_time' => substr((string) $s->send_time, 0, 5),
            'schedule_summary' => $s->describeSchedule(),
            'cooldown_days' => $s->cooldown_days,
            'is_active' => $s->is_active,
            'next_run_at' => $s->next_run_at?->toIso8601String(),
            'last_run_at' => $s->last_run_at?->toIso8601String(),
            'runs_count' => $s->runs_count,
            'campaigns_count' => (int) ($s->campaigns_count ?? $s->campaigns()->count()),
            'last_campaign' => $last ? [
                'id' => $last->id,
                'status' => $last->status,
                'total_recipients' => $last->total_recipients,
                'results' => $last->results(),
                'notes' => $last->notes,
            ] : null,
        ];
    }
}
