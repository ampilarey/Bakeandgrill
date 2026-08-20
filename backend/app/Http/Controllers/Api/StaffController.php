<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use App\Rules\StrongStaffPin;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class StaffController extends Controller
{
    public function __construct(private readonly AuditLogService $audit) {}

    // ─── Internal authorization guard (defense-in-depth) ─────────────────────
    private function authorizePermission(Request $request, string $permission): void
    {
        $user = $request->user();
        if (!$user || $user instanceof Customer) {
            abort(403, 'Forbidden.');
        }
        if (!$user->hasPermission($permission)) {
            abort(403, 'You do not have permission to perform this action.');
        }
    }

    private function actorIsOwner(User $actor): bool
    {
        $actor->loadMissing('role');

        return $actor->role?->slug === 'owner';
    }

    private function isOwnerAccount(User $target): bool
    {
        $target->loadMissing('role');

        return $target->role?->slug === 'owner';
    }

    private function roleIdIsOwner(int $roleId): bool
    {
        return Role::where('id', $roleId)->where('slug', 'owner')->exists();
    }

    /**
     * Non-owners may manage only non-owner accounts.
     * Owners may manage any staff account (subject to last-owner guards).
     */
    private function assertCanManageTarget(User $actor, User $target): void
    {
        if ($this->actorIsOwner($actor)) {
            return;
        }

        if ($this->isOwnerAccount($target)) {
            abort(403, 'Only an owner can manage owner accounts.');
        }
    }

    private function assertCanAssignRole(User $actor, int $roleId, bool $isSelf): void
    {
        if ($this->actorIsOwner($actor)) {
            return;
        }

        if ($isSelf) {
            abort(403, 'You cannot change your own role.');
        }

        if ($this->roleIdIsOwner($roleId)) {
            abort(403, 'Only an owner can assign the owner role.');
        }
    }

    /**
     * Lock all active Owner rows in deterministic id order so concurrent
     * demote/deactivate/delete cannot race past a non-atomic count.
     *
     * @return Collection<int, User>
     */
    private function lockActiveOwners(): Collection
    {
        return User::query()
            ->whereHas('role', fn ($q) => $q->where('slug', 'owner'))
            ->where('is_active', true)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();
    }

    /**
     * Normalize Laravel "boolean" rule inputs to a real bool.
     * Accepts false / 0 / "0" / "false" / "off" / "no" as false, and the
     * usual truthy counterparts as true — matching `boolean` validation
     * without requiring clients to send strict JSON booleans only.
     */
    private function normalizeBooleanInput(mixed $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * True when the requested patch would remove this account from the
     * active-Owner set (demote, deactivate, or both).
     *
     * Expects is_active (when present) to already be a normalized bool.
     */
    private function wouldRemoveActiveOwner(User $target, array $validated): bool
    {
        if (!$this->isOwnerAccount($target) || !$target->is_active) {
            return false;
        }

        $demoting = isset($validated['role_id']) && !$this->roleIdIsOwner((int) $validated['role_id']);
        $deactivating = array_key_exists('is_active', $validated) && $validated['is_active'] === false;

        return $demoting || $deactivating;
    }

    private function formatUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role?->slug,
            'role_name' => $user->role?->name,
            'role_id' => $user->role_id,
            'is_active' => $user->is_active,
            'last_login_at' => $user->last_login_at?->toIso8601String(),
            'has_pin' => !is_null($user->pin_hash),
            'two_factor_enabled' => $user->hasTwoFactorEnabled(),
            'created_at' => $user->created_at->toIso8601String(),
        ];
    }

    /** GET /api/admin/staff */
    public function index(): JsonResponse
    {
        $users = User::with('role')->orderByDesc('created_at')->paginate(100);

        return response()->json([
            'staff' => $users->map(fn (User $u) => $this->formatUser($u)),
            'roles' => Role::orderBy('name')->get(['id', 'name', 'slug']),
        ]);
    }

    /** POST /api/admin/staff */
    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission($request, 'staff.create');

        /** @var User $actor */
        $actor = $request->user();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'phone' => 'nullable|string|max:20',
            'role_id' => 'required|exists:roles,id',
            'pin' => ['required', 'digits_between:4,8', new StrongStaffPin()],
        ]);

        if (!$this->actorIsOwner($actor) && $this->roleIdIsOwner((int) $validated['role_id'])) {
            abort(403, 'Only an owner can create owner accounts.');
        }

        $user = User::create([
            'name' => $validated['name'],
            'email' => strtolower(trim($validated['email'])),
            'phone' => $validated['phone'] ?? null,
            'password' => str()->random(32),
            'role_id' => $validated['role_id'],
            'pin_hash' => Hash::make($validated['pin']),
            'is_active' => true,
        ]);

        $user->load('role');

        return response()->json(['staff' => $this->formatUser($user)], 201);
    }

    /** PATCH /api/admin/staff/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->authorizePermission($request, 'staff.update');

        /** @var User $actor */
        $actor = $request->user();

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($id)],
            'phone' => 'nullable|string|max:20',
            'role_id' => 'sometimes|exists:roles,id',
            'is_active' => 'sometimes|boolean',
        ]);

        if (isset($validated['email'])) {
            $validated['email'] = strtolower(trim($validated['email']));
        }

        // Cast accepted boolean inputs (false / 0 / "0" / …) to one bool so the
        // last-Owner guard and the persisted update always agree.
        if (array_key_exists('is_active', $validated)) {
            $validated['is_active'] = $this->normalizeBooleanInput($validated['is_active']);
        }

        $user = DB::transaction(function () use ($actor, $id, $validated, $request): User {
            // For Owner-removing changes, lock the full active-Owner set first
            // (deterministic id order) to avoid races/deadlocks between concurrent
            // demote/deactivate requests. Then re-read the target from that set.
            $preTarget = User::with('role')->findOrFail($id);
            $removingOwner = $this->wouldRemoveActiveOwner($preTarget, $validated);
            $activeOwners = null;

            if ($removingOwner) {
                $activeOwners = $this->lockActiveOwners();
                $user = $activeOwners->firstWhere('id', $id);
                if ($user === null) {
                    // Target left the active-Owner set concurrently — re-lock row.
                    $user = User::with('role')->lockForUpdate()->findOrFail($id);
                } else {
                    $user->loadMissing('role');
                }
            } else {
                $user = User::with('role')->lockForUpdate()->findOrFail($id);
            }

            $this->assertCanManageTarget($actor, $user);

            if (isset($validated['role_id'])) {
                $this->assertCanAssignRole(
                    $actor,
                    (int) $validated['role_id'],
                    $actor->id === $user->id,
                );
            }

            // After authz + row locks: reject if this change would leave zero Owners.
            if ($this->wouldRemoveActiveOwner($user, $validated)) {
                $activeCount = $activeOwners?->count() ?? $this->lockActiveOwners()->count();
                if ($activeCount <= 1) {
                    abort(422, 'Cannot demote or deactivate the last active owner.');
                }
            }

            $tracked = array_intersect_key($validated, array_flip(['name', 'email', 'phone', 'role_id', 'is_active']));
            $before = $user->only(array_keys($tracked));

            $user->update($validated);
            // Role relation must refresh so subsequent permission checks see the new role.
            $user->unsetRelation('role');
            $user->load('role');

            // Deactivate → revoke only this staff user's Sanctum tokens (same txn).
            if (array_key_exists('is_active', $validated) && !$user->is_active) {
                $user->tokens()->delete();
            }

            if ($tracked !== []) {
                $this->audit->log(
                    'staff.updated',
                    'User',
                    $user->id,
                    $before,
                    $user->only(array_keys($tracked)),
                    [],
                    $request,
                );
            }

            return $user;
        });

        return response()->json(['staff' => $this->formatUser($user)]);
    }

    /** POST /api/admin/staff/{id}/pin  — reset PIN */
    public function resetPin(Request $request, int $id): JsonResponse
    {
        $this->authorizePermission($request, 'staff.update');

        /** @var User $actor */
        $actor = $request->user();

        $validated = $request->validate([
            'pin' => ['required', 'digits_between:4,8', new StrongStaffPin()],
        ]);

        DB::transaction(function () use ($actor, $id, $validated, $request): void {
            $user = User::with('role')->lockForUpdate()->findOrFail($id);
            $this->assertCanManageTarget($actor, $user);

            $user->update(['pin_hash' => Hash::make($validated['pin'])]);
            // PIN reset invalidates existing sessions for this staff user only.
            $user->tokens()->delete();

            $this->audit->log('staff.pin_reset', 'User', $user->id, [], ['reset_by' => $request->user()?->id], [], $request);
        });

        return response()->json(['message' => 'PIN updated successfully.']);
    }

    /**
     * DELETE /api/admin/staff/{id}/two-factor
     *
     * Someone lost their phone. Without this, a staff member with 2FA on and a
     * handset at the bottom of the harbour is locked out of the admin panel
     * until they find a recovery code — and nobody keeps those.
     *
     * It is a reset, not a bypass: their next sign-in is single-factor, and
     * they are expected to enrol a new phone from My Account. Loudly audited,
     * because "an owner cleared someone's second factor" is precisely the
     * event worth being able to find later.
     */
    public function resetTwoFactor(Request $request, int $id, \App\Services\TwoFactorService $twoFactor): JsonResponse
    {
        $this->authorizePermission($request, 'staff.update');

        /** @var User $actor */
        $actor = $request->user();

        $user = User::with('role')->findOrFail($id);
        $this->assertCanManageTarget($actor, $user);

        if (!$user->hasTwoFactorEnabled() && $user->two_factor_secret === null) {
            return response()->json(['message' => 'Two-factor was not set up on this account.']);
        }

        $twoFactor->disable($user, $actor, $request);

        // A lost phone may be a lost phone in someone else's hands, so cut the
        // account's other sessions at the same time.
        $user->tokens()->delete();

        return response()->json([
            'message' => 'Two-factor reset. They can sign in with their password and set up a new phone.',
            'staff' => $this->formatUser($user->fresh()->load('role')),
        ]);
    }

    /** DELETE /api/admin/staff/{id} */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->authorizePermission($request, 'staff.delete');

        /** @var User $actor */
        $actor = $request->user();

        return DB::transaction(function () use ($actor, $id): JsonResponse {
            $preTarget = User::with('role')->findOrFail($id);

            // Lock active Owners first (id order) when deleting an active Owner.
            if ($preTarget->role?->slug === 'owner' && $preTarget->is_active) {
                $activeOwners = $this->lockActiveOwners();
                $user = $activeOwners->firstWhere('id', $id) ?? User::with('role')->lockForUpdate()->findOrFail($id);
                $user->loadMissing('role');

                $this->assertCanManageTarget($actor, $user);

                if ($user->role?->slug === 'owner' && $user->is_active && $activeOwners->count() <= 1) {
                    return response()->json(['message' => 'Cannot delete the last active owner.'], 422);
                }
            } else {
                $user = User::with('role')->lockForUpdate()->findOrFail($id);
                $this->assertCanManageTarget($actor, $user);
            }

            $user->delete();

            return response()->json(['message' => 'Staff member removed.']);
        });
    }
}
