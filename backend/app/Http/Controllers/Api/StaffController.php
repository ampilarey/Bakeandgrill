<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class StaffController extends Controller
{
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

    private function formatUser(User $user): array
    {
        return [
            'id'            => $user->id,
            'name'          => $user->name,
            'email'         => $user->email,
            'role'          => $user->role?->slug,
            'role_name'     => $user->role?->name,
            'role_id'       => $user->role_id,
            'is_active'     => $user->is_active,
            'last_login_at' => $user->last_login_at?->toIso8601String(),
            'has_pin'       => !is_null($user->pin_hash),
            'created_at'    => $user->created_at->toIso8601String(),
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

        $validated = $request->validate([
            'name'    => 'required|string|max:255',
            'email'   => 'required|email|unique:users,email',
            'role_id' => 'required|exists:roles,id',
            'pin'     => 'required|digits_between:4,8',
        ]);

        $user = User::create([
            'name'      => $validated['name'],
            'email'     => $validated['email'],
            'password'  => Hash::make(str()->random(32)),
            'role_id'   => $validated['role_id'],
            'pin_hash'  => Hash::make($validated['pin']),
            'is_active' => true,
        ]);

        $user->load('role');

        return response()->json(['staff' => $this->formatUser($user)], 201);
    }

    /** PATCH /api/admin/staff/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->authorizePermission($request, 'staff.update');

        $user = User::findOrFail($id);

        $validated = $request->validate([
            'name'      => 'sometimes|string|max:255',
            'email'     => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'role_id'   => 'sometimes|exists:roles,id',
            'is_active' => 'sometimes|boolean',
        ]);

        $user->update($validated);
        $user->load('role');

        return response()->json(['staff' => $this->formatUser($user)]);
    }

    /** POST /api/admin/staff/{id}/pin  — reset PIN */
    public function resetPin(Request $request, int $id): JsonResponse
    {
        $this->authorizePermission($request, 'staff.update');

        $validated = $request->validate([
            'pin' => 'required|digits_between:4,8',
        ]);

        $user = User::findOrFail($id);
        $user->update(['pin_hash' => Hash::make($validated['pin'])]);

        return response()->json(['message' => 'PIN updated successfully.']);
    }

    /** DELETE /api/admin/staff/{id} */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->authorizePermission($request, 'staff.delete');

        $user = User::findOrFail($id);

        // Prevent deleting the last active owner — only applies when the user being
        // deleted is themselves an owner.
        if ($user->role?->slug === 'owner' && $user->is_active) {
            $activeOwners = User::whereHas('role', fn ($q) => $q->where('slug', 'owner'))
                ->where('is_active', true)
                ->count();

            if ($activeOwners <= 1) {
                return response()->json(['message' => 'Cannot delete the last active owner.'], 422);
            }
        }

        $user->delete();

        return response()->json(['message' => 'Staff member removed.']);
    }
}
