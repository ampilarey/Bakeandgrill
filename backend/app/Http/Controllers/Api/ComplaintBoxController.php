<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Console\Commands\RemindStaleComplaints;
use App\Console\Commands\SendComplaintWeeklySummary;
use App\Domains\Complaints\Services\ComplaintBoxService;
use App\Http\Controllers\Controller;
use App\Models\ComplaintBoxEntry;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** The complaint box as the owner sees it. */
class ComplaintBoxController extends Controller
{
    public function __construct(private readonly ComplaintBoxService $box) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'status' => ['nullable', 'string', Rule::in(array_merge(['open', 'all'], ComplaintBoxEntry::STATUSES))],
            'category' => ['nullable', 'string', Rule::in(array_merge(['staff'], ComplaintBoxEntry::CATEGORIES))],
            'search' => ['nullable', 'string', 'max:100'],
        ]);

        $status = (string) $request->query('status', 'open');
        $category = (string) $request->query('category', '');
        $search = trim((string) $request->query('search', ''));

        $query = ComplaintBoxEntry::query();
        if ($status === 'open') {
            $query->whereIn('status', ComplaintBoxEntry::OPEN_STATUSES);
        } elseif ($status !== 'all') {
            $query->where('status', $status);
        }
        if ($category === 'staff') {
            $query->where(function ($q) {
                foreach (ComplaintBoxEntry::STAFF_CATEGORIES as $c) {
                    $q->orWhere('categories', 'like', '%"' . $c . '"%');
                }
            });
        } elseif ($category !== '') {
            $query->where('categories', 'like', '%"' . $category . '"%');
        }
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('reference_number', 'like', "%{$search}%")
                    ->orWhere('about_staff', 'like', "%{$search}%")
                    ->orWhere('comment', 'like', "%{$search}%")
                    ->orWhere('order_ref', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        // Newest first: the owner is reading the SMS that just arrived.
        $paginator = $query->orderByDesc('created_at')
            ->paginate(min(50, max(1, (int) $request->query('per_page', 25))));

        $open = ComplaintBoxEntry::query()->whereIn('status', ComplaintBoxEntry::OPEN_STATUSES);

        return response()->json([
            'entries' => $paginator,
            'meta' => [
                'open_count' => (clone $open)->count(),
                'new_count' => (clone $open)->where('status', ComplaintBoxEntry::STATUS_NEW)->count(),
                'staff_open_count' => (clone $open)->where(function ($q) {
                    foreach (ComplaintBoxEntry::STAFF_CATEGORIES as $c) {
                        $q->orWhere('categories', 'like', '%"' . $c . '"%');
                    }
                })->count(),
                'this_week_count' => ComplaintBoxEntry::query()->where('created_at', '>=', now()->subDays(7))->count(),
            ],
            'categories' => ComplaintBoxEntry::categoryOptions(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $entry = ComplaintBoxEntry::query()
            ->with(['events.user:id,name', 'resolver:id,name'])
            ->findOrFail($id);

        return response()->json(['entry' => $entry]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(ComplaintBoxEntry::STATUSES)],
            'internal_note' => ['nullable', 'string', 'max:2000'],
            'message' => ['nullable', 'string', 'max:600'],
        ]);

        $entry = ComplaintBoxEntry::query()->findOrFail($id);
        $updated = $this->box->changeStatus(
            $entry,
            $validated['status'],
            $request->user(),
            $validated['internal_note'] ?? null,
            $validated['message'] ?? null,
        );

        return response()->json(['entry' => $updated]);
    }

    public function message(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:600'],
        ]);

        $entry = ComplaintBoxEntry::query()->findOrFail($id);
        $event = $this->box->messageCustomer($entry, $validated['message'], $request->user());

        return response()->json([
            'event' => $event,
            'entry' => $entry->fresh(['events.user:id,name', 'resolver:id,name']),
        ], 201);
    }

    /**
     * Complaints per named staff member (owner, 2026-09-21, phase B). The
     * name is whatever the customer typed, so "Ali", "ali" and " Ali " are
     * one person; "the tall cashier" is a person too, as far as the box
     * knows.
     */
    public function byStaff(): JsonResponse
    {
        $rows = ComplaintBoxEntry::query()
            ->whereNotNull('about_staff')
            ->where('about_staff', '!=', '')
            ->orderByDesc('created_at')
            ->limit(5000)
            ->get(['id', 'reference_number', 'about_staff', 'categories', 'status', 'created_at']);

        $staff = $rows->groupBy(fn (ComplaintBoxEntry $e) => mb_strtolower(trim((string) $e->about_staff)))
            ->map(function ($group) {
                $cats = [];
                foreach ($group as $e) {
                    foreach ((array) $e->categories as $c) {
                        $cats[$c] = ($cats[$c] ?? 0) + 1;
                    }
                }
                arsort($cats);
                $open = $group->filter(fn (ComplaintBoxEntry $e) => in_array($e->status, ComplaintBoxEntry::OPEN_STATUSES, true));

                return [
                    // The spelling the customer used most recently.
                    'name' => trim((string) $group->first()->about_staff),
                    'total' => $group->count(),
                    'open' => $open->count(),
                    'last_at' => $group->first()->created_at?->toIso8601String(),
                    'first_at' => $group->last()->created_at?->toIso8601String(),
                    'last_30_days' => $group->filter(fn (ComplaintBoxEntry $e) => $e->created_at >= now()->subDays(30))->count(),
                    'categories' => collect($cats)->map(fn (int $n, string $c) => ['key' => $c, 'label' => ComplaintBoxEntry::categoryLabel($c), 'count' => $n])->values()->all(),
                    'recent' => $group->take(5)->map(fn (ComplaintBoxEntry $e) => ['id' => $e->id, 'reference' => $e->reference_number, 'status' => $e->status, 'created_at' => $e->created_at?->toIso8601String()])->values()->all(),
                ];
            })
            ->sortByDesc(fn (array $r) => sprintf('%06d%06d', $r['open'], $r['total']))
            ->values()
            ->all();

        return response()->json([
            'staff' => $staff,
            'unnamed' => ComplaintBoxEntry::query()->where(fn ($q) => $q->whereNull('about_staff')->orWhere('about_staff', ''))->count(),
        ]);
    }

    /** GET /complaint-box/alert-settings */
    public function alertSettings(): JsonResponse
    {
        return response()->json(['settings' => $this->currentAlertSettings()]);
    }

    /** PATCH /complaint-box/alert-settings */
    public function updateAlertSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'weekly_sms' => ['sometimes', 'boolean'],
            'stale_sms' => ['sometimes', 'boolean'],
            'stale_days' => ['sometimes', 'integer', 'min:1', 'max:30'],
        ]);
        if (array_key_exists('weekly_sms', $data)) {
            SiteSetting::set(SendComplaintWeeklySummary::SETTING, filter_var($data['weekly_sms'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }
        if (array_key_exists('stale_sms', $data)) {
            SiteSetting::set(RemindStaleComplaints::SETTING_ON, filter_var($data['stale_sms'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }
        if (array_key_exists('stale_days', $data)) {
            SiteSetting::set(RemindStaleComplaints::SETTING_DAYS, (string) (int) $data['stale_days']);
        }
        SiteSetting::bust();

        return response()->json(['message' => 'Alert settings saved.', 'settings' => $this->currentAlertSettings()]);
    }

    /** @return array{weekly_sms: bool, stale_sms: bool, stale_days: int} */
    private function currentAlertSettings(): array
    {
        return [
            'weekly_sms' => filter_var(SiteSetting::get(SendComplaintWeeklySummary::SETTING, '0'), FILTER_VALIDATE_BOOLEAN),
            'stale_sms' => filter_var(SiteSetting::get(RemindStaleComplaints::SETTING_ON, '1'), FILTER_VALIDATE_BOOLEAN),
            'stale_days' => RemindStaleComplaints::days(),
        ];
    }
}
