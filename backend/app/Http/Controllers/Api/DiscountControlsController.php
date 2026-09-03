<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Support\DiscountSettings;
use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DiscountControlsController extends Controller
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    public function show(): JsonResponse
    {
        return response()->json($this->payload());
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'discount_manual_enabled' => 'sometimes|boolean',
            'discount_max_percent' => 'sometimes|integer|min:0|max:100',
            'discount_max_fixed_mvr' => 'sometimes|numeric|min:0',
            'discount_role_caps' => 'sometimes|array',
            'discount_reason_required' => 'sometimes|boolean',
            'discount_reasons' => 'sometimes|array|min:1',
            'discount_reasons.*' => 'required|string|max:100',
            'discount_approval_required' => 'sometimes|boolean',
            'discount_approval_approvers' => 'sometimes|array',
            'discount_approval_approvers.*.phone' => 'required_with:discount_approval_approvers|string|max:30',
            'discount_approval_approvers.*.label' => 'nullable|string|max:100',
            'discount_approval_approvers.*.user_id' => 'nullable|integer|exists:users,id',
            'discount_approval_code_ttl_minutes' => 'sometimes|integer|min:1|max:60',
            'discount_approval_max_attempts' => 'sometimes|integer|min:1|max:20',
            'discount_margin_floor_enabled' => 'sometimes|boolean',
            'discount_margin_floor_pct' => 'sometimes|integer|min:0|max:100',
        ]);

        $old = $this->payload();

        if (array_key_exists('discount_manual_enabled', $validated)) {
            SiteSetting::set(DiscountSettings::MANUAL_ENABLED, $validated['discount_manual_enabled'] ? 'true' : 'false');
        }
        if (array_key_exists('discount_max_percent', $validated)) {
            SiteSetting::set(DiscountSettings::MAX_PERCENT, (string) $validated['discount_max_percent']);
        }
        if (array_key_exists('discount_max_fixed_mvr', $validated)) {
            SiteSetting::set(DiscountSettings::MAX_FIXED_MVR, (string) $validated['discount_max_fixed_mvr']);
        }
        if (array_key_exists('discount_role_caps', $validated)) {
            SiteSetting::set(DiscountSettings::ROLE_CAPS, json_encode($validated['discount_role_caps'], JSON_UNESCAPED_UNICODE));
        }
        if (array_key_exists('discount_reason_required', $validated)) {
            SiteSetting::set(DiscountSettings::REASON_REQUIRED, $validated['discount_reason_required'] ? 'true' : 'false');
        }
        if (array_key_exists('discount_reasons', $validated)) {
            $reasons = array_values(array_filter(array_map(
                fn ($r) => trim((string) $r),
                $validated['discount_reasons'],
            )));
            if ($reasons === []) {
                return response()->json(['message' => 'At least one discount reason is required.'], 422);
            }
            SiteSetting::set(DiscountSettings::REASONS, json_encode($reasons, JSON_UNESCAPED_UNICODE));
        }
        // Approval is no longer a switch (see DiscountSettings::approvalRequired).
        // The key is still accepted so an older admin build does not fail
        // validation, but nothing is written for it.
        if (array_key_exists('discount_approval_approvers', $validated)) {
            $approvers = [];
            foreach ($validated['discount_approval_approvers'] as $row) {
                $phone = trim((string) ($row['phone'] ?? ''));
                if ($phone === '') {
                    continue;
                }
                $approvers[] = [
                    'user_id' => $row['user_id'] ?? null,
                    'phone' => $phone,
                    'label' => trim((string) ($row['label'] ?? '')),
                ];
            }
            SiteSetting::set(DiscountSettings::APPROVERS, json_encode($approvers, JSON_UNESCAPED_UNICODE));
        }
        if (array_key_exists('discount_approval_code_ttl_minutes', $validated)) {
            SiteSetting::set(DiscountSettings::CODE_TTL_MINUTES, (string) $validated['discount_approval_code_ttl_minutes']);
        }
        if (array_key_exists('discount_approval_max_attempts', $validated)) {
            SiteSetting::set(DiscountSettings::MAX_ATTEMPTS, (string) $validated['discount_approval_max_attempts']);
        }
        if (array_key_exists('discount_margin_floor_enabled', $validated)) {
            SiteSetting::set(
                DiscountSettings::MARGIN_FLOOR_ENABLED,
                $validated['discount_margin_floor_enabled'] ? 'true' : 'false',
            );
        }
        if (array_key_exists('discount_margin_floor_pct', $validated)) {
            SiteSetting::set(
                DiscountSettings::MARGIN_FLOOR_PCT,
                (string) max(0, min(100, (int) $validated['discount_margin_floor_pct'])),
            );
        }

        SiteSetting::bust();
        $new = $this->payload();

        $this->audit->log(
            'discounts.controls.updated',
            'SiteSetting',
            null,
            $old,
            $new,
            [],
            $request,
        );

        return response()->json($new);
    }

    /** @return array<string, mixed> */
    private function payload(): array
    {
        $discountPerm = Permission::where('slug', 'promotions.discounts')->first();
        $overridePerm = Permission::where('slug', 'promotions.discount_override')->first();

        $rolesWithDiscount = Role::query()
            ->where('is_active', true)
            ->where(function ($q) use ($discountPerm) {
                $q->where('slug', 'owner');
                if ($discountPerm) {
                    $q->orWhereHas('permissions', fn ($p) => $p->where('permissions.id', $discountPerm->id));
                }
            })
            ->orderBy('name')
            ->pluck('name')
            ->all();

        $rolesWithOverride = Role::query()
            ->where('is_active', true)
            ->where(function ($q) use ($overridePerm) {
                $q->where('slug', 'owner');
                if ($overridePerm) {
                    $q->orWhereHas('permissions', fn ($p) => $p->where('permissions.id', $overridePerm->id));
                }
            })
            ->orderBy('name')
            ->pluck('name')
            ->all();

        return [
            'discount_manual_enabled' => DiscountSettings::manualEnabled(),
            'discount_max_percent' => DiscountSettings::maxPercent(),
            'discount_max_fixed_mvr' => DiscountSettings::maxFixedMvr(),
            'discount_role_caps' => DiscountSettings::roleCaps(),
            'discount_reason_required' => DiscountSettings::reasonRequired(),
            'discount_reasons' => DiscountSettings::reasons(),
            'discount_approval_required' => DiscountSettings::approvalRequired(),
            'discount_approval_approvers' => DiscountSettings::approvers(),
            'discount_approval_code_ttl_minutes' => DiscountSettings::codeTtlMinutes(),
            'discount_approval_max_attempts' => DiscountSettings::maxAttempts(),
            'discount_margin_floor_enabled' => DiscountSettings::marginFloorEnabled(),
            'discount_margin_floor_pct' => DiscountSettings::marginFloorPct(),
            // The floor can only protect a line whose cost is known. This is
            // how many active items it cannot protect.
            'items_without_cost' => \App\Models\Item::query()
                ->where('is_active', true)
                ->where(fn ($q) => $q->whereNull('cost')->orWhere('cost', '<=', 0))
                ->count(),
            'roles_with_discounts' => $rolesWithDiscount,
            'roles_with_override' => $rolesWithOverride,
        ];
    }
}
