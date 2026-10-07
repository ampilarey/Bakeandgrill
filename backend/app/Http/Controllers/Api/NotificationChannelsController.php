<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\Support\NotificationChannels;
use App\Domains\Telegram\Services\TelegramLinker;
use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin → SMS Control Center → "Who gets alerts, and how" (owner,
 * 2026-10-07: "admin is the one who controls everything, for example admin
 * decides in which channel notifications goes to a specific role or
 * person"). Channels per role, and a person's own choice over their role's.
 */
class NotificationChannelsController extends Controller
{
    public function __construct(private readonly AuditLogService $audit) {}

    public function index(TelegramLinker $linker): JsonResponse
    {
        $roleNames = Role::query()->pluck('name', 'slug');
        $people = User::query()->with('role')->where('is_active', true)->orderBy('name')->get()
            ->map(fn (User $u) => $this->personJson($u, $linker))
            ->values();

        return response()->json([
            'channels' => NotificationChannels::ALL,
            'roles' => collect(NotificationChannels::roles())
                ->map(fn (array $channels, string $slug) => ['key' => $slug, 'label' => (string) ($roleNames[$slug] ?? $slug), 'channels' => $channels])
                ->values(),
            'people' => $people,
        ]);
    }

    public function updateRoles(Request $request): JsonResponse
    {
        $data = $request->validate([
            'roles' => 'required|array',
            'roles.*' => 'array',
            'roles.*.*' => ['string', Rule::in(NotificationChannels::ALL)],
        ]);
        $before = NotificationChannels::roles();
        NotificationChannels::setRoles($data['roles']);
        $after = NotificationChannels::roles();
        $this->audit->log('notify.channels.roles_updated', 'SiteSetting', null, $before, $after, [], $request);

        return response()->json(['roles' => $after]);
    }

    public function updatePerson(Request $request, User $user, TelegramLinker $linker): JsonResponse
    {
        $data = $request->validate([
            // null = follow the role
            'channels' => 'present|nullable|array',
            'channels.*' => ['string', Rule::in(NotificationChannels::ALL)],
        ]);
        $before = ['channels' => $user->notify_channels];
        NotificationChannels::setUser($user, $data['channels']);
        $user->refresh();
        $this->audit->log('notify.channels.person_updated', 'User', $user->id, $before, ['channels' => $user->notify_channels], [], $request);

        return response()->json(['person' => $this->personJson($user, $linker)]);
    }

    /** @return array<string, mixed> */
    private function personJson(User $u, TelegramLinker $linker): array
    {
        $email = trim((string) $u->email);

        return [
            'id' => $u->id,
            'name' => $u->name,
            'role' => $u->role?->slug,
            'role_label' => $u->role?->name,
            'phone' => trim((string) $u->phone) !== '' ? $u->phone : null,
            'email' => filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null,
            'telegram_linked' => $linker->linkForUser($u) !== null,
            'own_channels' => is_array($u->notify_channels) ? NotificationChannels::forUser($u) : null,
            'channels' => NotificationChannels::forUser($u),
        ];
    }
}
