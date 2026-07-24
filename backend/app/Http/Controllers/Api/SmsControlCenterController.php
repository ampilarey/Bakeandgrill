<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\Services\PermissionService;
use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\SmsTemplate;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SmsControlCenterController extends Controller
{
    public function __construct(
        private readonly AuditLogService $audit,
        private readonly PermissionService $permissions,
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

        $permissionSlugs = array_values(array_unique(array_filter(
            array_column(SmsTypeRegistry::all(), 'send_permission'),
        )));
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
            if ($entry['template_slug']) {
                $tpl = $templates->get($entry['template_slug']);
                if ($tpl) {
                    $template = [
                        'id' => $tpl->id,
                        'slug' => $tpl->slug,
                        'body' => $tpl->body,
                        'variables' => $tpl->variables ?? [],
                    ];
                }
            }

            $permSlug = $entry['send_permission'];
            $types[] = [
                'key' => $key,
                'label' => $entry['label'],
                'category' => $entry['category'],
                'enabled' => SmsTypeRegistry::isTypeEnabled($entry),
                'always_on' => (bool) $entry['always_on'],
                'suppressible' => (bool) $entry['suppressible'],
                'send_permission' => $permSlug,
                'send_permission_label' => $permSlug
                    ? ($permissionMeta->get($permSlug)?->name ?? $permSlug)
                    : 'System',
                'roles_with_permission' => $permSlug ? ($rolesByPermission[$permSlug] ?? ['Owner']) : ['System'],
                'template' => $template,
                'last_30_days' => [
                    'count' => $count,
                    'cost_mvr' => round($cost, 2),
                ],
            ];
        }

        $demoMode = $this->isDemoMode();

        return response()->json([
            'global_kill_switch' => SmsTypeRegistry::isGlobalKillSwitchOn(),
            'demo_mode' => $demoMode,
            'types' => $types,
        ]);
    }

    /**
     * PATCH /api/admin/sms/types/{key}
     */
    public function updateType(Request $request, string $key): JsonResponse
    {
        $entry = SmsTypeRegistry::get($key);
        if ($entry === null) {
            return response()->json(['message' => 'Unknown SMS type.'], 404);
        }

        if (!empty($entry['always_on'])) {
            return response()->json([
                'message' => 'This SMS type is always on and cannot be toggled. Use the global kill switch to halt all SMS.',
            ], 422);
        }

        if (empty($entry['enabled_setting'])) {
            return response()->json(['message' => 'This SMS type has no toggle.'], 422);
        }

        $validated = $request->validate([
            'enabled' => 'required|boolean',
        ]);

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

        return response()->json([
            'key' => $key,
            'enabled' => $validated['enabled'],
        ]);
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
