<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Social\Services\SocialAutomationSettings;
use App\Domains\Social\Services\SocialBestTimes;
use App\Domains\Social\Services\SocialPostingRules;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

/**
 * The content calendar (owner's shortlist, 2026-09-24): every post with a
 * date in the range, the automations' slots as ghost entries, the
 * unscheduled drafts beside it, the posting rules and the best-times hint.
 */
class SocialCalendarController extends Controller
{
    public function calendar(Request $request, SocialAutomationSettings $automations, SocialPostingRules $rules, SocialBestTimes $bestTimes): JsonResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $tz = config('app.timezone', 'Indian/Maldives');
        $from = Carbon::parse($data['from'], $tz)->startOfDay();
        $to = Carbon::parse($data['to'], $tz)->endOfDay();
        if ($from->diffInDays($to) > 62) {
            return response()->json(['message' => 'At most two months at a time.'], 422);
        }

        $posts = SocialPost::query()
            ->with(['deliveries.channel:id,platform,name'])
            ->where('source', '!=', 'channel_test')
            ->where('status', '!=', SocialPost::STATUS_DRAFT)
            ->where(function ($q) use ($from, $to) {
                $q->whereBetween('scheduled_at', [$from, $to])
                    ->orWhereBetween('published_at', [$from, $to])
                    ->orWhere(fn ($qq) => $qq->whereNull('scheduled_at')->whereNull('published_at')->whereBetween('created_at', [$from, $to]));
            })
            ->orderBy('id')
            ->get()
            ->map(fn (SocialPost $p) => $this->entry($p, $tz))
            ->values();

        $drafts = SocialPost::query()
            ->with(['deliveries.channel:id,platform,name'])
            ->whereIn('status', [SocialPost::STATUS_DRAFT, SocialPost::STATUS_AWAITING_APPROVAL])
            ->orderByDesc('id')
            ->limit(30)
            ->get()
            ->map(fn (SocialPost $p) => $this->entry($p, $tz))
            ->values();

        return response()->json([
            'posts' => $posts,
            'drafts' => $drafts,
            'slots' => $this->slots($automations, $from, $to, $tz),
            'rules' => $rules->all(),
            'best_times' => $bestTimes->compute(),
        ]);
    }

    /** Move a scheduled post (or schedule a draft) to another day, keeping the time of day. */
    public function move(Request $request, SocialPostingRules $rules, int $id): JsonResponse
    {
        $this->requirePermission($request, 'social.schedule');
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'time' => ['nullable', 'date_format:H:i'],
        ]);
        $post = SocialPost::with('deliveries')->findOrFail($id);
        if (!in_array($post->status, [SocialPost::STATUS_DRAFT, SocialPost::STATUS_SCHEDULED, SocialPost::STATUS_AWAITING_APPROVAL], true)) {
            return response()->json(['message' => 'Only drafts and scheduled posts can be moved.'], 422);
        }

        $tz = config('app.timezone', 'Indian/Maldives');
        $time = $data['time'] ?? ($post->scheduled_at?->copy()->setTimezone($tz)->format('H:i') ?? '11:00');
        $at = Carbon::parse($data['date'] . ' ' . $time, $tz);
        if ($at->lte(now())) {
            return response()->json(['message' => 'That time has already passed.'], 422);
        }

        $post->forceFill(['status' => SocialPost::STATUS_SCHEDULED, 'scheduled_at' => $at])->save();
        foreach ($post->deliveries as $delivery) {
            if (in_array($delivery->status, [SocialPostDelivery::STATUS_SCHEDULED, SocialPostDelivery::STATUS_QUEUED], true)) {
                $delivery->forceFill(['status' => SocialPostDelivery::STATUS_SCHEDULED])->save();
            }
        }

        return response()->json([
            'post' => $this->entry($post->fresh(['deliveries.channel']), $tz),
            'warning' => $rules->conflict($at, $post->id),
        ]);
    }

    public function rules(SocialPostingRules $rules): JsonResponse
    {
        return response()->json(['rules' => $rules->all()]);
    }

    public function updateRules(Request $request, SocialPostingRules $rules): JsonResponse
    {
        $this->requirePermission($request, 'social.publish');
        $data = $request->validate([
            'min_gap_minutes' => ['sometimes', 'integer', 'between:0,1440'],
            'max_per_day' => ['sometimes', 'integer', 'between:0,20'],
        ]);

        return response()->json(['rules' => $rules->update($data)]);
    }

    public function bestTimes(SocialBestTimes $bestTimes): JsonResponse
    {
        return response()->json(['best_times' => $bestTimes->compute()]);
    }

    /** @return array<string, mixed> */
    private function entry(SocialPost $p, string $tz): array
    {
        $at = $p->published_at ?? $p->scheduled_at ?? $p->created_at;

        return [
            'id' => $p->id,
            'status' => $p->status,
            'source' => $p->source,
            'caption' => Str::limit((string) ($p->snapshot['caption'] ?? ''), 80),
            'image_url' => $p->snapshot['image_url'] ?? null,
            'at' => $at?->toIso8601String(),
            'date' => $at?->copy()->setTimezone($tz)->toDateString(),
            'time' => $at?->copy()->setTimezone($tz)->format('H:i'),
            'platforms' => $p->deliveries->map(fn ($d) => $d->channel?->platform)->filter()->unique()->values(),
        ];
    }

    /**
     * Ghost entries for each enabled automation: the days in range it may
     * fire on. It may still post nothing (no special, nothing new).
     *
     * @return list<array{kind: string, date: string, time: string}>
     */
    private function slots(SocialAutomationSettings $automations, Carbon $from, Carbon $to, string $tz): array
    {
        $out = [];
        foreach ($automations->allKinds() as $kind => $config) {
            if (!$config['enabled'] || $config['channel_ids'] === []) {
                continue;
            }
            foreach (CarbonPeriod::create($from->copy()->setTimezone($tz)->startOfDay(), '1 day', $to->copy()->setTimezone($tz)) as $day) {
                if ($kind === 'featured' && !in_array((int) $day->dayOfWeek, $config['days'], true)) {
                    continue;
                }
                $out[] = ['kind' => $kind, 'date' => $day->toDateString(), 'time' => $config['time']];
            }
        }

        return $out;
    }

    private function requirePermission(Request $request, string $slug): void
    {
        $user = $request->user();
        if (!$user instanceof \App\Models\User || !app(PermissionService::class)->hasPermission($user, $slug)) {
            abort(403, "Missing permission: {$slug}");
        }
    }
}
