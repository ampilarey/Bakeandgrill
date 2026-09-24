<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Social\Drivers\SocialPublishException;
use App\Domains\Social\Services\SocialCommentSync;
use App\Models\SocialComment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

/** The comment inbox: list, sync now, mark read, reply as the page. */
class SocialCommentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = SocialComment::query()
            ->with(['delivery.channel:id,platform,name', 'delivery.post:id,snapshot,source'])
            ->orderByDesc('posted_at')
            ->orderByDesc('id');
        if ($request->boolean('unread')) {
            $query->whereNull('read_at');
        }
        if ($request->boolean('flagged')) {
            $query->where('flagged', true);
        }
        $page = $query->paginate(min(100, max(10, (int) $request->input('per_page', 30))));

        return response()->json([
            'comments' => collect($page->items())->map(fn (SocialComment $c) => $this->payload($c))->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
            'unread' => SocialComment::query()->whereNull('read_at')->count(),
        ]);
    }

    public function sync(SocialCommentSync $sync): JsonResponse
    {
        $new = $sync->syncRecent();

        return response()->json(['new' => $new, 'unread' => SocialComment::query()->whereNull('read_at')->count()]);
    }

    public function markRead(Request $request, int $id): JsonResponse
    {
        $comment = SocialComment::findOrFail($id);
        $comment->forceFill(['read_at' => $request->boolean('unread') ? null : now()])->save();

        return response()->json(['comment' => $this->payload($comment->fresh(['delivery.channel', 'delivery.post']))]);
    }

    public function markAllRead(): JsonResponse
    {
        SocialComment::query()->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['unread' => 0]);
    }

    public function reply(Request $request, SocialCommentSync $sync, int $id): JsonResponse
    {
        $this->requirePermission($request, 'social.publish');
        $data = $request->validate(['message' => ['required', 'string', 'max:2000']]);
        $comment = SocialComment::findOrFail($id);
        try {
            $sync->reply($comment, trim($data['message']));
        } catch (SocialPublishException $e) {
            return response()->json(['message' => 'The platform refused the reply: ' . $e->getMessage()], 422);
        }

        return response()->json(['comment' => $this->payload($comment->fresh(['delivery.channel', 'delivery.post']))]);
    }

    /** @return array<string, mixed> */
    private function payload(SocialComment $c): array
    {
        $delivery = $c->delivery;

        return [
            'id' => $c->id,
            'author' => $c->author,
            'text' => $c->text,
            'posted_at' => $c->posted_at?->toIso8601String(),
            'flagged' => $c->flagged,
            'read_at' => $c->read_at?->toIso8601String(),
            'replied_at' => $c->replied_at?->toIso8601String(),
            'reply_text' => $c->reply_text,
            'platform' => $delivery?->channel?->platform,
            'channel_name' => $delivery?->channel?->name,
            'permalink' => $delivery?->permalink,
            'post_id' => $delivery?->social_post_id,
            'post_caption' => Str::limit((string) ($delivery?->post?->snapshot['caption'] ?? ''), 60),
            'can_reply' => in_array($delivery?->channel?->platform, ['facebook', 'instagram'], true),
        ];
    }

    private function requirePermission(Request $request, string $slug): void
    {
        $user = $request->user();
        if (!$user instanceof \App\Models\User || !app(PermissionService::class)->hasPermission($user, $slug)) {
            abort(403, "Missing permission: {$slug}");
        }
    }
}
