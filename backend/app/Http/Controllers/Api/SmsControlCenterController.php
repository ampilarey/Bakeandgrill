<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsBudgetGate;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\SmsCampaign;
use App\Models\SmsCampaignRecipient;
use App\Models\SmsLog;
use App\Models\SmsTemplate;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SmsControlCenterController extends Controller
{
    public function __construct(
        private readonly AuditLogService $audit,
        private readonly PermissionService $permissions,
        private readonly SmsService $sms,
        private readonly SmsTemplateRenderer $renderer,
    ) {}

    /**
     * GET /api/admin/sms/control-center
     * Readable with sms.settings.manage OR sms.logs.view.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user
            || (!$this->permissions->hasPermission($user, 'sms.settings.manage')
                && !$this->permissions->hasPermission($user, 'sms.logs.view'))
        ) {
            return response()->json([
                'message' => 'You do not have permission to perform this action.',
                'required' => ['sms.settings.manage', 'sms.logs.view'],
            ], 403);
        }

        $since = now()->subDays(30);
        $stats = SmsLog::query()
            ->select([
                'type',
                DB::raw('COUNT(*) as send_count'),
                DB::raw('COALESCE(SUM(cost_estimate_mvr), 0) as cost_mvr'),
            ])
            ->where('created_at', '>=', $since)
            ->whereIn('status', ['sent', 'demo', 'failed', 'queued', 'disabled', 'suppressed'])
            ->groupBy('type')
            ->get()
            ->keyBy('type');

        $slugs = array_values(array_filter(array_column(SmsTypeRegistry::all(), 'template_slug')));
        $templates = SmsTemplate::query()
            ->whereIn('slug', $slugs)
            ->get()
            ->keyBy('slug');

        $permissionSlugs = array_values(array_unique(array_filter([
            ...array_column(SmsTypeRegistry::all(), 'send_permission'),
            ...SmsTypeRegistry::ASSIGNABLE_SEND_PERMISSIONS,
        ])));
        $permissionMeta = Permission::query()
            ->whereIn('slug', $permissionSlugs)
            ->get()
            ->keyBy('slug');

        $rolesByPermission = [];
        foreach ($permissionSlugs as $slug) {
            $roleNames = Role::query()
                ->where('is_active', true)
                ->where(function ($q) use ($slug) {
                    $q->where('slug', 'owner')
                        ->orWhereHas('permissions', fn ($p) => $p->where('slug', $slug));
                })
                ->orderBy('name')
                ->pluck('name')
                ->unique()
                ->values()
                ->all();
            $rolesByPermission[$slug] = $roleNames;
        }

        $types = [];
        foreach (SmsTypeRegistry::all() as $entry) {
            $key = $entry['key'];
            $aliasHits = array_keys(array_filter(
                [
                    'otp' => 'auth_customer_otp',
                    'staff_password_reset' => 'auth_staff_password_reset',
                    'campaign' => 'marketing_campaign',
                    'promotion' => 'marketing_promotion',
                ],
                fn ($mapped) => $mapped === $key,
            ));
            $typeKeys = array_values(array_unique([$key, ...$aliasHits]));

            $count = 0;
            $cost = 0.0;
            foreach ($typeKeys as $tk) {
                if ($stats->has($tk)) {
                    $count += (int) $stats[$tk]->send_count;
                    $cost += (float) $stats[$tk]->cost_mvr;
                }
            }

            $template = null;
            $codeFallback = null;
            if ($entry['template_slug']) {
                $tpl = $templates->get($entry['template_slug']);
                if ($tpl) {
                    $template = [
                        'id' => $tpl->id,
                        'slug' => $tpl->slug,
                        'body' => $tpl->body,
                        'variables' => $tpl->variables ?? [],
                    ];
                    // When body is blank, send path uses code/config fallback.
                    if (trim((string) $tpl->body) === '') {
                        $codeFallback = '(code fallback — empty template uses PHP/config default at send time)';
                    }
                }
            }

            $permSlug = SmsTypeRegistry::effectiveSendPermission($entry);
            $systemOnly = $permSlug === null;

            $types[] = [
                'key' => $key,
                'label' => $entry['label'],
                'category' => $entry['category'],
                'enabled' => SmsTypeRegistry::isTypeEnabled($entry),
                'always_on' => (bool) $entry['always_on'],
                'suppressible' => (bool) $entry['suppressible'],
                'recipients' => $entry['recipients'],
                'user_initiated' => (bool) ($entry['user_initiated'] ?? false),
                'send_permission' => $permSlug,
                'send_permission_label' => $systemOnly
                    ? 'System-initiated — no manual sending'
                    : ($permissionMeta->get($permSlug)?->name ?? $permSlug),
                'roles_with_permission' => $systemOnly
                    ? ['System']
                    : ($rolesByPermission[$permSlug] ?? ['Owner']),
                'default_send_permission' => $entry['send_permission'],
                'template' => $template,
                'code_fallback_note' => $codeFallback,
                'sample_variables' => SmsTypeRegistry::sampleVariables($key),
                'last_30_days' => [
                    'count' => $count,
                    'cost_mvr' => round($cost, 2),
                ],
            ];
        }

        $permissionOptions = collect(SmsTypeRegistry::ASSIGNABLE_SEND_PERMISSIONS)
            ->map(fn (string $slug) => [
                'slug' => $slug,
                'name' => $permissionMeta->get($slug)?->name ?? $slug,
            ])
            ->values()
            ->all();

        return response()->json([
            'global_kill_switch' => SmsTypeRegistry::isGlobalKillSwitchOn(),
            'demo_mode' => $this->isDemoMode(),
            'budget' => SmsBudgetGate::usageSnapshot(),
            'campaign_queue' => $this->campaignQueueHealth(),
            'permission_options' => $permissionOptions,
            'types' => $types,
        ]);
    }

    /**
     * PATCH /api/admin/sms/types/{key}
     *
     * Accepts any of: enabled, body, send_permission.
     */
    public function updateType(Request $request, string $key): JsonResponse
    {
        $entry = SmsTypeRegistry::get($key);
        if ($entry === null) {
            return response()->json(['message' => 'Unknown SMS type.'], 404);
        }

        $validated = $request->validate([
            'enabled' => 'sometimes|boolean',
            'body' => 'sometimes|nullable|string|max:1000',
            'send_permission' => [
                'sometimes',
                'nullable',
                'string',
                Rule::in([...SmsTypeRegistry::ASSIGNABLE_SEND_PERMISSIONS, '__system__', '']),
            ],
        ]);

        if ($validated === []) {
            return response()->json(['message' => 'Provide enabled, body, and/or send_permission.'], 422);
        }

        $response = ['key' => $key];

        if (array_key_exists('enabled', $validated)) {
            if (!empty($entry['always_on'])) {
                return response()->json([
                    'message' => 'This SMS type is always on and cannot be toggled. Use the global kill switch to halt all SMS.',
                ], 422);
            }
            if (empty($entry['enabled_setting'])) {
                return response()->json(['message' => 'This SMS type has no toggle.'], 422);
            }

            $settingKey = $entry['enabled_setting'];
            $old = SiteSetting::get($settingKey, ($entry['default_enabled'] ?? true) ? 'true' : 'false');
            $new = $validated['enabled'] ? 'true' : 'false';
            SiteSetting::set($settingKey, $new);

            $this->audit->log(
                'sms.type.enabled.updated',
                'SiteSetting',
                null,
                ['key' => $settingKey, 'enabled' => $old === 'true'],
                ['key' => $settingKey, 'enabled' => $validated['enabled'], 'type' => $key],
                ['sms_type' => $key],
                $request,
            );

            $response['enabled'] = $validated['enabled'];
        }

        if (array_key_exists('body', $validated)) {
            $slug = $entry['template_slug'] ?? null;
            if ($slug === null || $slug === '') {
                return response()->json([
                    'message' => 'This SMS type has no editable template (message is set per campaign / send).',
                ], 422);
            }

            $tpl = SmsTemplate::query()->firstOrCreate(
                ['slug' => $slug],
                [
                    'name' => $entry['label'],
                    'type' => 'customer_notification',
                    'body' => '',
                    'description' => $entry['label'],
                    'is_system' => true,
                    'variables' => [],
                ],
            );

            $oldBody = (string) $tpl->body;
            $newBody = (string) ($validated['body'] ?? '');
            $tpl->body = $newBody;
            $tpl->save();

            $this->audit->log(
                'sms.type.wording.updated',
                'SmsTemplate',
                $tpl->id,
                ['body' => $oldBody, 'type' => $key],
                ['body' => $newBody, 'type' => $key],
                ['sms_type' => $key, 'slug' => $slug],
                $request,
            );

            $estimate = $this->sms->estimate($newBody !== '' ? $newBody : ' ');
            $response['template'] = [
                'id' => $tpl->id,
                'slug' => $tpl->slug,
                'body' => $tpl->body,
                'variables' => $tpl->variables ?? [],
            ];
            $response['estimate'] = $estimate;
        }

        if (array_key_exists('send_permission', $validated)) {
            $oldPerm = SmsTypeRegistry::effectiveSendPermission($entry);
            $raw = $validated['send_permission'];
            $newPerm = ($raw === null || $raw === '' || $raw === '__system__') ? null : (string) $raw;
            SmsTypeRegistry::setSendPermissionOverride($key, $newPerm);

            $this->audit->log(
                'sms.type.send_permission.updated',
                'SiteSetting',
                null,
                ['send_permission' => $oldPerm, 'type' => $key],
                ['send_permission' => $newPerm, 'type' => $key],
                ['sms_type' => $key],
                $request,
            );

            $response['send_permission'] = $newPerm;
            $response['send_permission_label'] = $newPerm === null
                ? 'System-initiated — no manual sending'
                : (Permission::query()->where('slug', $newPerm)->value('name') ?? $newPerm);
        }

        return response()->json($response);
    }

    /**
     * POST /api/admin/sms/types/{key}/preview
     */
    public function previewType(Request $request, string $key): JsonResponse
    {
        $entry = SmsTypeRegistry::get($key);
        if ($entry === null) {
            return response()->json(['message' => 'Unknown SMS type.'], 404);
        }

        $validated = $request->validate([
            'body' => 'nullable|string|max:1000',
        ]);

        $body = array_key_exists('body', $validated)
            ? (string) ($validated['body'] ?? '')
            : '';

        if ($body === '' && !empty($entry['template_slug'])) {
            $body = (string) (SmsTemplate::query()->where('slug', $entry['template_slug'])->value('body') ?? '');
        }

        $vars = SmsTypeRegistry::sampleVariables($key);
        $preview = $body === ''
            ? '(empty — code fallback will be used at send time)'
            : $this->renderer->renderRaw($body, $vars);

        $estimateSource = $preview === '(empty — code fallback will be used at send time)'
            ? ''
            : $preview;

        return response()->json([
            'preview' => $preview,
            'estimate' => $this->sms->estimate($estimateSource),
            'sample_variables' => $vars,
        ]);
    }

    /**
     * PATCH /api/admin/sms/budget
     */
    public function updateBudget(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'monthly_segment_ceiling' => 'nullable|integer|min:0|max:10000000',
            'per_campaign_segment_ceiling' => 'nullable|integer|min:0|max:10000000',
        ]);

        if ($validated === []) {
            return response()->json(['message' => 'Provide a ceiling value.'], 422);
        }

        $old = SmsBudgetGate::usageSnapshot();

        if (array_key_exists('monthly_segment_ceiling', $validated)) {
            $v = $validated['monthly_segment_ceiling'];
            SiteSetting::set(SmsBudgetGate::MONTHLY_SEGMENTS_SETTING, $v === null || $v === 0 ? '' : (string) $v);
        }
        if (array_key_exists('per_campaign_segment_ceiling', $validated)) {
            $v = $validated['per_campaign_segment_ceiling'];
            SiteSetting::set(SmsBudgetGate::PER_CAMPAIGN_SEGMENTS_SETTING, $v === null || $v === 0 ? '' : (string) $v);
        }

        $new = SmsBudgetGate::usageSnapshot();

        $this->audit->log(
            'sms.budget.updated',
            'SiteSetting',
            null,
            [
                'monthly_segment_ceiling' => $old['monthly_segment_ceiling'],
                'per_campaign_segment_ceiling' => $old['per_campaign_segment_ceiling'],
            ],
            [
                'monthly_segment_ceiling' => $new['monthly_segment_ceiling'],
                'per_campaign_segment_ceiling' => $new['per_campaign_segment_ceiling'],
            ],
            [],
            $request,
        );

        return response()->json(['budget' => $new]);
    }

    /**
     * PATCH /api/admin/sms/global-kill-switch
     * Owner-only (plus sms.settings.manage).
     */
    public function updateGlobalKillSwitch(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$this->permissions->isOwner($user)) {
            return response()->json([
                'message' => 'Only the owner can change the global SMS kill switch.',
            ], 403);
        }

        $validated = $request->validate([
            'enabled' => 'required|boolean',
        ]);

        $old = SmsTypeRegistry::isGlobalKillSwitchOn();
        $new = (bool) $validated['enabled'];

        SiteSetting::set(SmsTypeRegistry::GLOBAL_KILL_SWITCH, $new ? 'true' : 'false');

        $this->audit->log(
            'sms.global_kill_switch.updated',
            'SiteSetting',
            null,
            ['enabled' => $old],
            ['enabled' => $new],
            [
                'warning' => 'Halts ALL outbound SMS including login OTP codes when enabled.',
            ],
            $request,
        );

        return response()->json([
            'global_kill_switch' => $new,
        ]);
    }

    /**
     * @return array{
     *   running_campaigns: int,
     *   pending_recipients: int,
     *   failed_recipients_24h: int,
     *   failed_queue_jobs: int,
     *   campaigns: list<array{id:int,name:string,status:string,pending:int,failed:int,total:int}>
     * }
     */
    private function campaignQueueHealth(): array
    {
        $running = SmsCampaign::query()
            ->where('status', 'running')
            ->orderByDesc('started_at')
            ->limit(10)
            ->get();

        $pending = (int) SmsCampaignRecipient::query()
            ->where('status', 'pending')
            ->whereIn('campaign_id', $running->pluck('id')->all() ?: [0])
            ->count();

        $failedRecipients = (int) SmsCampaignRecipient::query()
            ->where('status', 'failed')
            ->where('updated_at', '>=', now()->subDay())
            ->count();

        $failedJobs = 0;
        if (DB::getSchemaBuilder()->hasTable('failed_jobs')) {
            $failedJobs = (int) DB::table('failed_jobs')
                ->where('failed_at', '>=', now()->subDay())
                ->where(function ($q) {
                    $q->where('payload', 'like', '%SendSmsCampaignRecipientJob%')
                        ->orWhere('payload', 'like', '%SendSmsPromotionRecipient%');
                })
                ->count();
        }

        $campaigns = $running->map(function (SmsCampaign $c) {
            $pendingCount = (int) $c->recipients()->where('status', 'pending')->count();

            return [
                'id' => $c->id,
                'name' => $c->name,
                'status' => $c->status,
                'pending' => $pendingCount,
                'failed' => (int) $c->failed_count,
                'total' => (int) $c->total_recipients,
            ];
        })->values()->all();

        return [
            'running_campaigns' => $running->count(),
            'pending_recipients' => $pending,
            'failed_recipients_24h' => $failedRecipients,
            'failed_queue_jobs' => $failedJobs,
            'campaigns' => $campaigns,
        ];
    }

    private function isDemoMode(): bool
    {
        $config = config('services.dhiraagu', []);
        $username = $config['username'] ?? null;
        $password = $config['password'] ?? null;
        $apiUrl = $config['api_url'] ?? null;

        if (!$username || !$password || !$apiUrl) {
            return true;
        }

        if (app()->environment('testing')) {
            return true;
        }

        if (app()->environment('local') && !($config['live'] ?? false)) {
            return true;
        }

        return false;
    }
}
