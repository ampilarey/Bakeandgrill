<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Ai\AiFeatures;
use App\Domains\Ai\AiSuggestions;
use App\Domains\Ai\AiTasks;
use App\Domains\Ai\AssistantUnavailable;
use App\Domains\Labels\LabelIngredients;
use App\Domains\Newsletter\Newsletter;
use App\Domains\Permissions\Services\PermissionService;
use App\Http\Controllers\Controller;
use App\Models\AiSuggestion;
use App\Models\Complaint;
use App\Models\InventoryItem;
use App\Models\ItemQuestion;
use App\Models\NewsletterIssue;
use App\Models\Review;
use App\Models\SocialComment;
use App\Models\User;
use App\Services\AuditLogService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The assistant's buttons (owner, 2026-11-24: "Build all. But add admin settings to
 * on/off"): the switches on System → Integrations → Assistant, and one endpoint per job.
 * Every job answers with a draft for the screen to show; nothing here saves, sends or
 * prints. A job that is switched off, or has no key, answers 422 with the reason.
 */
class AiController extends Controller
{
    public function __construct(private readonly AiFeatures $features, private readonly AiTasks $tasks) {}

    /** Which buttons a screen may show. Any signed-in staff. */
    public function status(): JsonResponse
    {
        return response()->json($this->features->status());
    }

    public function settings(): JsonResponse
    {
        return response()->json($this->features->present());
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'features' => ['sometimes', 'array'],
            'features.*' => ['boolean'],
        ]);
        $features = array_intersect_key($data['features'] ?? [], AiFeatures::FEATURES);
        $this->features->save(array_key_exists('enabled', $data) ? (bool) $data['enabled'] : null, array_map('boolval', $features));
        app(AuditLogService::class)->log('ai.settings_updated', 'SiteSetting', null, [], ['enabled' => $data['enabled'] ?? null, 'features' => $features], [], $request);

        return response()->json($this->features->present());
    }

    public function draftReview(int $id): JsonResponse
    {
        $r = Review::query()->with(['item:id,name', 'customer:id,name'])->findOrFail($id);

        return $this->run('reply_drafts', fn () => ['text' => $this->tasks->draftReply('review', [
            'stars_out_of_5' => (int) $r->rating,
            'what_they_wrote' => (string) $r->comment,
            'about_the_dish' => $r->item?->name,
            'came_from_an_order' => $r->order_id !== null,
        ])]);
    }

    public function draftQuestion(int $id): JsonResponse
    {
        $q = ItemQuestion::query()->with('item')->findOrFail($id);

        return $this->run('reply_drafts', fn () => ['text' => $this->tasks->draftReply('question', [
            'the_question' => (string) $q->question,
            'the_dish' => $q->item?->name,
            'what_the_menu_says_about_it' => trim(strip_tags((string) ($q->item?->description ?? ''))) ?: null,
            'its_price' => $q->item ? 'MVR ' . number_format((float) $q->item->base_price, 2) : null,
        ])]);
    }

    public function draftComplaint(int $id): JsonResponse
    {
        $c = Complaint::query()->with('order:id,order_number,type')->findOrFail($id);

        return $this->run('reply_drafts', fn () => ['text' => $this->tasks->draftReply('complaint', [
            'what_they_wrote' => (string) $c->comment,
            'what_it_is_about' => array_values((array) ($c->categories ?? [])),
            'a_food_safety_matter' => (bool) $c->is_food_safety,
            'their_reference' => (string) $c->reference_number,
            'order_number' => $c->order?->order_number,
            'our_own_note_not_for_the_customer' => trim((string) $c->internal_note) ?: null,
        ])]);
    }

    public function draftComment(Request $request, int $id): JsonResponse
    {
        $this->requirePermission($request, 'social.publish');
        $c = SocialComment::query()->with('delivery.post')->findOrFail($id);
        $post = $c->delivery?->post;

        return $this->run('reply_drafts', fn () => ['text' => $this->tasks->draftReply('comment', [
            'the_comment' => (string) $c->text,
            'our_post_said' => $post ? mb_substr((string) (($post->snapshot ?? [])['caption'] ?? ''), 0, 600) : null,
        ])]);
    }

    public function dhivehi(Request $request): JsonResponse
    {
        $data = $request->validate([
            'text' => ['required', 'string', 'max:4000'],
            'kind' => ['sometimes', 'in:text,name,sms,label'],
        ]);

        return $this->run('dhivehi', fn () => ['dv' => $this->tasks->dhivehi(trim($data['text']), $data['kind'] ?? 'text')]);
    }

    /** Dhivehi for the ingredient words the glossary is missing. */
    public function glossary(LabelIngredients $ingredients): JsonResponse
    {
        $words = array_slice(array_values(array_unique(array_map(fn (array $r) => (string) $r['word'], $ingredients->missingWords()))), 0, 60);
        if ($words === []) {
            return response()->json(['words' => []]);
        }

        return $this->run('glossary', function () use ($words): array {
            $rows = [];
            foreach ($this->tasks->glossary($words) as $en => $found) {
                $rows[] = ['word' => $en] + $found;
            }

            return ['words' => $rows];
        });
    }

    /** Typical values per 100 g for the ingredients sent. */
    public function nutrition(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['required', 'array', 'min:1', 'max:40'], 'ids.*' => ['integer']]);
        $names = InventoryItem::query()->whereIn('id', $data['ids'])->pluck('name', 'id')->map(fn ($n) => (string) $n)->all();
        if ($names === []) {
            return response()->json(['items' => []]);
        }

        return $this->run('nutrition', function () use ($names): array {
            $rows = [];
            foreach ($this->tasks->nutrition($names) as $id => $values) {
                $rows[] = ['id' => $id, 'nutrition' => $values];
            }

            return ['items' => $rows];
        });
    }

    public function caption(Request $request): JsonResponse
    {
        $this->requirePermission($request, 'social.compose');
        $data = $request->validate([
            'headline' => ['nullable', 'string', 'max:200'], 'kicker' => ['nullable', 'string', 'max:200'], 'tagline' => ['nullable', 'string', 'max:300'],
            'price' => ['nullable', 'string', 'max:60'], 'was' => ['nullable', 'string', 'max:60'], 'sticker' => ['nullable', 'string', 'max:80'],
            'cta' => ['nullable', 'string', 'max:80'], 'phone' => ['nullable', 'string', 'max:40'], 'link' => ['nullable', 'string', 'max:300'],
        ]);
        $post = array_filter([
            'the_dish_or_headline' => $data['headline'] ?? null, 'small_line_above' => $data['kicker'] ?? null, 'line_below' => $data['tagline'] ?? null,
            'price' => $data['price'] ?? null, 'price_before' => $data['was'] ?? null, 'sticker' => $data['sticker'] ?? null,
            'button' => $data['cta'] ?? null, 'phone' => $data['phone'] ?? null, 'link_to_order' => $data['link'] ?? null,
        ], fn ($v) => $v !== null && trim((string) $v) !== '');
        if (!isset($post['the_dish_or_headline'])) {
            return response()->json(['message' => 'Give the post a headline first.'], 422);
        }

        return $this->run('captions', fn () => $this->tasks->caption($post));
    }

    /** The issue as it stands on the screen, saved or not: what is ticked decides what the draft may talk about. */
    public function newsletter(Request $request, Newsletter $newsletter): JsonResponse
    {
        $data = $request->validate([
            'hint' => ['nullable', 'string', 'max:600'],
            'sections' => ['nullable', 'array'],
            'removed_item_ids' => ['nullable', 'array'],
            'removed_item_ids.*' => ['integer'],
        ]);
        $issue = new NewsletterIssue(['sections' => $data['sections'] ?? [], 'removed_item_ids' => $data['removed_item_ids'] ?? []]);
        $picks = $newsletter->picks($issue);
        $slim = fn (array $rows) => array_map(fn (array $d) => array_intersect_key($d, array_flip(['name', 'price', 'launch_at'])), $rows);

        return $this->run('newsletter', fn () => $this->tasks->newsletter([
            'new_dishes' => $slim($picks['new'] ?? []), 'specials' => $slim($picks['specials'] ?? []),
            'coming_soon' => $slim($picks['coming'] ?? []), 'offer' => $picks['offer'] ?? null,
        ], trim((string) ($data['hint'] ?? ''))));
    }

    /** A scanned or photographed customer PO, read into the invoice form's draft. */
    public function readPo(Request $request): JsonResponse
    {
        $request->validate(['file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpg,jpeg,png']]);
        $file = $request->file('file');
        $mime = match (strtolower((string) $file->getMimeType())) {
            'application/pdf' => 'application/pdf',
            'image/png' => 'image/png',
            default => 'image/jpeg',
        };
        $bytes = (string) file_get_contents((string) $file->getRealPath());

        return $this->run('po_scans', fn () => ['draft' => $this->tasks->readPo($bytes, $mime)]);
    }

    // ── Suggestions that wait for approval ───────────────────────────────

    /** What waits, for the kinds this person may decide. */
    public function suggestions(Request $request): JsonResponse
    {
        $mine = $this->myKinds($request);
        $rows = AiSuggestion::query()->where('status', 'pending')->whereIn('kind', array_keys($mine))->orderBy('kind')->orderBy('subject_label')->limit(500)->get();
        $kinds = [];
        foreach ($mine as $key => $def) {
            $kinds[] = [
                'key' => $key, 'label' => $def['label'], 'about' => $def['about'], 'can_approve' => $def['apply'], 'on' => $this->features->on($def['feature']),
                'rows' => $rows->where('kind', $key)->map(fn (AiSuggestion $s) => [
                    'id' => $s->id, 'subject_id' => $s->subject_id, 'subject' => $s->subject_label, 'before' => $s->before, 'proposed' => $s->proposed,
                    'reason' => $s->reason, 'made' => $s->created_at?->toDateString(),
                ])->values()->all(),
            ];
        }

        return response()->json(['kinds' => $kinds, 'ready' => $this->features->status()['ready']]);
    }

    /** Ask the assistant now, for one kind. */
    public function look(Request $request, AiSuggestions $suggestions): JsonResponse
    {
        $data = $request->validate(['kind' => ['required', 'string']]);
        if (!isset($this->myKinds($request)[$data['kind']])) {
            abort(403, 'Your account cannot ask for these suggestions.');
        }
        @set_time_limit(170);
        try {
            return response()->json(['made' => $suggestions->look($data['kind'])]);
        } catch (AssistantUnavailable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** Approve some, turn down others. A suggestion whose subject has changed since is left alone and said so. */
    public function decide(Request $request, AiSuggestions $suggestions): JsonResponse
    {
        $data = $request->validate([
            'approve' => ['sometimes', 'array', 'max:300'], 'approve.*' => ['integer'],
            'reject' => ['sometimes', 'array', 'max:300'], 'reject.*' => ['integer'],
            // The person's own wording for a Dhivehi suggestion, by suggestion id.
            'edits' => ['sometimes', 'array'], 'edits.*' => ['array'], 'edits.*.*' => ['nullable', 'string', 'max:200'],
        ]);
        $mine = $this->myKinds($request);
        $user = $request->user();
        $count = ['approved' => 0, 'rejected' => 0, 'stale' => 0];
        $ids = array_merge($data['approve'] ?? [], $data['reject'] ?? []);
        foreach (AiSuggestion::query()->whereIn('id', $ids)->where('status', 'pending')->get() as $s) {
            if (!isset($mine[$s->kind])) {
                continue;
            }
            $result = in_array($s->id, $data['approve'] ?? [], true)
                ? $suggestions->approve($s, $user, (array) ($data['edits'][$s->id] ?? []))
                : $suggestions->reject($s, $user);
            $count[$result] = ($count[$result] ?? 0) + 1;
            if ($result === 'approved') {
                app(AuditLogService::class)->log('ai.suggestion_approved', 'AiSuggestion', $s->id, (array) ($s->before ?? []), ['kind' => $s->kind, 'subject' => $s->subject_label, 'proposed' => $s->proposed], [], $request);
            }
        }

        return response()->json($count);
    }

    /** @return array<string, array{label: string, about: string, feature: string, permission: string, apply: bool}> the kinds this person may decide */
    private function myKinds(Request $request): array
    {
        $user = $request->user();
        $perms = app(PermissionService::class);

        return array_filter(AiSuggestions::KINDS, fn (array $k) => $user instanceof User && $perms->hasPermission($user, $k['permission']));
    }

    /** @param Closure(): array<string, mixed> $job */
    private function run(string $feature, Closure $job): JsonResponse
    {
        @set_time_limit(150);
        try {
            $this->features->mustBeOn($feature);

            return response()->json($job());
        } catch (AssistantUnavailable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function requirePermission(Request $request, string $slug): void
    {
        $user = $request->user();
        if (!$user instanceof User || !app(PermissionService::class)->hasPermission($user, $slug)) {
            abort(403, "Missing permission: {$slug}");
        }
    }
}
