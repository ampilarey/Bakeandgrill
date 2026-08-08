<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
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
     * Lock all active Owner rows so concurrent demote/deactivate/delete
     * cannot race past a non-atomic count and leave zero active Owners.
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
     * Inside a transaction (with active owners locked): block demotion /
     * deactivation of the last active Owner.
     */
    private function assertNotLastActiveOwnerChangeLocked(User $target, array $validated): void
    {
        if (!$this->isOwnerAccount($target) || !$target->is_active) {
            return;
        }

        $demoting = isset($validated['role_id']) && !$this->roleIdIsOwner((int) $validated['role_id']);
        $deactivating = array_key_exists('is_active', $validated) && $validated['is_active'] === false;

        if (!$demoting && !$deactivating) {
            return;
        }

        if ($this->lockActiveOwners()->count() <= 1) {
            abort(422, 'Cannot demote or deactivate the last active owner.');
        }
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
            'pin' => 'required|digits_between:4,8',
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

        $user = DB::transaction(function () use ($actor, $id, $validated, $request): User {
            $user = User::with('role')->lockForUpdate()->findOrFail($id);

            $this->assertCanManageTarget($actor, $user);

            if (isset($validated['role_id'])) {
                $this->assertCanAssignRole(
                    $actor,
                    (int) $validated['role_id'],
                    $actor->id === $user->id,
                );
            }

            // Lock active owners before counting when demoting/deactivating an Owner.
            $this->assertNotLastActiveOwnerChangeLocked($user, $validated);

            $tracked = array_intersect_key($validated, array_flip(['name', 'email', 'phone', 'role_id', 'is_active']));
            $before = $user->only(array_keys($tracked));

            $user->update($validated);
            // Role relation must refresh so subsequent permission checks see the new role.
            $user->unsetRelation('role');
            $user->load('role');

            // Same immediate lockout pattern as drivers: deactivate → revoke PATs.
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
            'pin' => 'required|digits_between:4,8',
        ]);

        $user = User::with('role')->findOrFail($id);
        $this->assertCanManageTarget($actor, $user);

        $user->update(['pin_hash' => Hash::make($validated['pin'])]);
        // PIN reset invalidates existing sessions (mirrors driver PIN reset).
        $user->tokens()->delete();

        $this->audit->log('staff.pin_reset', 'User', $user->id, [], ['reset_by' => $request->user()?->id], [], $request);

        return response()->json(['message' => 'PIN updated successfully.']);
    }

    /** DELETE /api/admin/staff/{id} */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->authorizePermission($request, 'staff.delete');

        /** @var User $actor */
        $actor = $request->user();

        return DB::transaction(function () use ($actor, $id): JsonResponse {
            $user = User::with('role')->lockForUpdate()->findOrFail($id);

            $this->assertCanManageTarget($actor, $user);

            // Prevent deleting the last active owner — lock active owners first
            // so concurrent deletes cannot race past a plain count.
            if ($user->role?->slug === 'owner' && $user->is_active) {
                if ($this->lockActiveOwners()->count() <= 1) {
                    return response()->json(['message' => 'Cannot delete the last active owner.'], 422);
                }
            }

            $user->delete();

            return response()->json(['message' => 'Staff member removed.']);
        });
    }
}
