<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Newsletter\Newsletter;
use App\Http\Controllers\Controller;
use App\Mail\NewsletterIssueMail;
use App\Models\NewsletterDelivery;
use App\Models\NewsletterIssue;
use App\Models\NewsletterSubscriber;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Customers & Marketing → Newsletter (iruali import plan, feature 4; newsletter.manage). */
class AdminNewsletterController extends Controller
{
    public function __construct(private readonly Newsletter $newsletter) {}

    public function index(): JsonResponse
    {
        $issues = NewsletterIssue::query()->orderByDesc('id')->limit(50)->get()->map(fn (NewsletterIssue $i) => $this->summary($i));

        return response()->json([
            'issues' => $issues,
            'audience' => $this->audienceCount(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $issue = NewsletterIssue::query()->findOrFail($id);

        return response()->json(['issue' => $this->summary($issue) + [
            'body_en' => $issue->body_en, 'body_dv' => $issue->body_dv, 'header_image_url' => $issue->header_image_url,
            'sections' => $issue->sections ?? [], 'removed_item_ids' => $issue->removed_item_ids ?? [],
            'picks' => $this->newsletter->picks($issue),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $issue = NewsletterIssue::query()->create($this->validated($request) + ['status' => NewsletterIssue::DRAFT, 'created_by' => $user instanceof User ? $user->id : null]);

        return $this->show($issue->id)->setStatusCode(201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $issue = NewsletterIssue::query()->findOrFail($id);
        abort_unless($issue->status === NewsletterIssue::DRAFT, 422, 'A sent newsletter cannot be changed.');
        $issue->update($this->validated($request));

        return $this->show($issue->id);
    }

    /** GET /api/admin/newsletter/issues/{id}/preview?locale=en|dv: the email as HTML. */
    public function preview(Request $request, int $id): Response
    {
        $issue = NewsletterIssue::query()->findOrFail($id);
        $sub = new NewsletterSubscriber(['email' => 'preview@example.com', 'locale' => $request->query('locale') === 'dv' ? 'dv' : 'en', 'token' => 'preview']);
        $html = (new NewsletterIssueMail($issue, $sub, $this->newsletter->picks($issue), true))->render();

        return response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8', 'X-Frame-Options' => 'SAMEORIGIN']);
    }

    public function test(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate(['email' => ['required', 'email:rfc'], 'locale' => ['nullable', 'in:en,dv']]);
        $this->newsletter->sendTest(NewsletterIssue::query()->findOrFail($id), $validated['email'], $validated['locale'] ?? 'en');

        return response()->json(['message' => 'Test sent to ' . $validated['email'] . '.']);
    }

    public function send(int $id): JsonResponse
    {
        $count = $this->newsletter->send(NewsletterIssue::query()->findOrFail($id));

        return response()->json(['queued' => $count, 'message' => "Sending to {$count} addresses."]);
    }

    public function retry(int $id): JsonResponse
    {
        $n = $this->newsletter->retryFailed(NewsletterIssue::query()->findOrFail($id));

        return response()->json(['queued' => $n]);
    }

    public function subscribers(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $page = NewsletterSubscriber::query()
            ->when($q !== '', fn ($w) => $w->where('email', 'like', '%' . $q . '%'))
            ->orderByDesc('id')->paginate(50);

        return response()->json([
            'data' => collect($page->items())->map(fn (NewsletterSubscriber $s) => [
                'id' => $s->id, 'email' => $s->email, 'locale' => $s->locale, 'source' => $s->source,
                'confirmed_at' => $s->confirmed_at, 'unsubscribed_at' => $s->unsubscribed_at, 'created_at' => $s->created_at,
                'bounced_at' => $s->bounced_at, 'bounce_count' => $s->bounce_count, 'bounce_reason' => $s->bounce_reason,
            ])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function csv(): StreamedResponse
    {
        return response()->streamDownload(function (): void {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['email', 'language', 'source', 'signed_up', 'confirmed', 'unsubscribed', 'bounced', 'bounce_reason']);
            NewsletterSubscriber::query()->orderBy('id')->chunk(500, function ($rows) use ($out): void {
                foreach ($rows as $s) {
                    fputcsv($out, [$s->email, $s->locale, $s->source, $s->created_at?->toDateTimeString(), $s->confirmed_at?->toDateTimeString(), $s->unsubscribed_at?->toDateTimeString(), $s->bounced_at?->toDateTimeString(), $s->bounce_reason]);
                }
            });
            fclose($out);
        }, 'newsletter-subscribers-' . now()->format('Y-m-d') . '.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $v = $request->validate([
            'subject_en' => ['required', 'string', 'max:150'],
            'subject_dv' => ['nullable', 'string', 'max:150'],
            'body_en' => ['nullable', 'string', 'max:5000'],
            'body_dv' => ['nullable', 'string', 'max:5000'],
            'header_image_url' => ['nullable', 'url', 'max:500'],
            'sections' => ['nullable', 'array'],
            'sections.new' => ['sometimes', 'boolean'],
            'sections.new_days' => ['sometimes', 'integer', 'min:1', 'max:90'],
            'sections.specials' => ['sometimes', 'boolean'],
            'sections.coming' => ['sometimes', 'boolean'],
            'sections.offer_id' => ['sometimes', 'nullable', 'integer', 'exists:promotions,id'],
            'removed_item_ids' => ['nullable', 'array'],
            'removed_item_ids.*' => ['integer'],
        ]);

        return $v;
    }

    /** @return array<string, mixed> */
    private function summary(NewsletterIssue $i): array
    {
        $counts = NewsletterDelivery::query()->where('issue_id', $i->id)->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');

        return [
            'id' => $i->id, 'subject_en' => $i->subject_en, 'subject_dv' => $i->subject_dv,
            'status' => $i->status, 'sent_at' => $i->sent_at, 'created_at' => $i->created_at,
            'counts' => ['sent' => (int) ($counts['sent'] ?? 0), 'failed' => (int) ($counts['failed'] ?? 0), 'bounced' => (int) ($counts['bounced'] ?? 0), 'pending' => (int) (($counts['pending'] ?? 0) + ($counts['sending'] ?? 0))],
        ];
    }

    private function audienceCount(): int
    {
        return NewsletterSubscriber::query()->whereNotNull('confirmed_at')->whereNull('unsubscribed_at')->count();
    }
}
