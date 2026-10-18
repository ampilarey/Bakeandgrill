<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Cards\CardSheet;
use App\Domains\Cards\CardSource;
use App\Domains\Cards\CardSpec;
use App\Http\Controllers\Controller;
use App\Models\CardDesign;
use App\Models\CardPrint;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\PermissionService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Printed cards: saved designs, a live preview and the PDF (owner, 2026-10-18). The PDF
 * comes back in the reply, never through a link: a gift card's code is a bearer of money
 * and must not sit in a URL or a log. Needs promotions.manage; a discount card batch also
 * needs promotions.discount_cards, as its own page does.
 */
class CardController extends Controller
{
    public function __construct(
        private readonly CardSource $sources,
        private readonly CardSheet $sheet,
        private readonly PermissionService $permissions,
        private readonly AuditLogService $audit,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'designs' => CardDesign::query()->orderByDesc('updated_at')->get()->map(fn (CardDesign $d) => $this->designJson($d))->values(),
            'prints' => CardPrint::query()->with(['design:id,name', 'user:id,name'])->latest('id')->limit(30)->get()->map(fn (CardPrint $p) => [
                'id' => $p->id,
                'design' => $p->design?->name,
                'source' => $p->source,
                'source_id' => $p->source_id,
                'cards' => $p->cards,
                'output' => $p->output,
                'sides' => $p->sides,
                'by' => $p->user?->name,
                'at' => $p->created_at?->toIso8601String(),
            ])->values(),
            'defaults' => collect(CardSpec::KINDS)->mapWithKeys(fn (string $k) => [$k => CardSpec::defaults($k)]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:120'], 'settings' => ['required', 'array']]);
        $design = CardDesign::query()->create([
            'name' => trim($data['name']),
            'settings' => CardSpec::clean($data['settings']),
            'created_by' => $request->user()?->id,
        ]);

        return response()->json(['design' => $this->designJson($design)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $design = CardDesign::query()->findOrFail($id);
        $data = $request->validate(['name' => ['sometimes', 'string', 'max:120'], 'settings' => ['sometimes', 'array']]);
        if (isset($data['name'])) {
            $design->name = trim($data['name']);
        }
        if (isset($data['settings'])) {
            $design->settings = CardSpec::clean($data['settings']);
        }
        $design->save();

        return response()->json(['design' => $this->designJson($design)]);
    }

    public function destroy(int $id): JsonResponse
    {
        CardDesign::query()->findOrFail($id)->delete();

        return response()->json(['ok' => true]);
    }

    /** The first card's front and back as HTML, for the designer's live preview. */
    public function preview(Request $request): JsonResponse
    {
        $data = $this->validated($request, false);
        $spec = CardSpec::clean($data['settings']);
        $run = isset($data['source']) && ($data['source']['type'] ?? 'none') !== 'none'
            ? $this->run($request, $data['source'])
            : CardSource::sample($spec['kind']);
        $sheet = $this->sheet->build($spec, $run, 'card', 'both', false, true);

        return response()->json([
            'html' => view('cards.sheet', ['sheet' => $sheet, 'forPdf' => false, 'title' => 'Card preview'])->render(),
            'page' => CardSpec::page($spec),
            'cards' => count($run['entries']),
            'a4_per_page' => array_product(CardSheet::grid(...CardSpec::page($spec))),
        ]);
    }

    public function pdf(Request $request): Response
    {
        $data = $this->validated($request, true);
        $spec = CardSpec::clean($data['settings']);
        $run = $this->run($request, $data['source']);
        $sheet = $this->sheet->build($spec, $run, $data['output'], $data['sides'], true);
        $pt = 72 / 25.4;

        /** @var User|null $user */
        $user = $request->user();
        $print = CardPrint::query()->create([
            'card_design_id' => isset($data['design_id']) && CardDesign::query()->whereKey($data['design_id'])->exists() ? (int) $data['design_id'] : null,
            'source' => $run['type'],
            'source_id' => $run['id'],
            'cards' => count($run['entries']),
            'output' => $data['output'],
            'sides' => $spec['back'] ? $data['sides'] : 'front',
            'note' => isset($data['note']) ? Str::limit(trim((string) $data['note']), 190, '') : null,
            'user_id' => $user?->id,
        ]);
        $this->audit->log('cards.printed', 'CardPrint', $print->id, [], ['source' => $run['type'], 'source_id' => $run['id'], 'cards' => $print->cards], [], $request);

        $name = 'cards-' . Str::slug($run['kind']) . '-' . now()->format('Y-m-d-His') . '.pdf';

        return Pdf::loadView('cards.sheet', ['sheet' => $sheet, 'forPdf' => true, 'title' => 'Cards'])
            ->setPaper([0, 0, $sheet['page_w'] * $pt, $sheet['page_h'] * $pt])
            ->setOption('isRemoteEnabled', false)
            ->download($name);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $forPrint): array
    {
        return $request->validate([
            'settings' => ['required', 'array'],
            'design_id' => ['nullable', 'integer'],
            'source' => [$forPrint ? 'required' : 'sometimes', 'array'],
            'source.type' => [$forPrint ? 'required' : 'sometimes', Rule::in(CardSource::TYPES)],
            'source.id' => ['nullable', 'integer'],
            'source.code' => ['nullable', 'string', 'max:64'],
            'source.copies' => ['nullable', 'integer', 'min:1', 'max:' . CardSource::MAX_CARDS],
            'source.start' => ['nullable', 'integer', 'min:1'],
            'source.count' => ['nullable', 'integer', 'min:1', 'max:' . CardSource::MAX_CARDS],
            'output' => [$forPrint ? 'required' : 'sometimes', Rule::in(CardSheet::OUTPUTS)],
            'sides' => [$forPrint ? 'required' : 'sometimes', Rule::in(CardSheet::SIDES)],
            'note' => ['nullable', 'string', 'max:200'],
        ]);
    }

    /** @param array<string, mixed> $source */
    private function run(Request $request, array $source): array
    {
        if (($source['type'] ?? '') === 'discount_batch') {
            /** @var User $user */
            $user = $request->user();
            abort_unless($this->permissions->hasPermission($user, 'promotions.discount_cards'), 403, 'Printing discount cards needs the Discount cards permission.');
        }

        return $this->sources->resolve($source);
    }

    private function designJson(CardDesign $d): array
    {
        return [
            'id' => $d->id,
            'name' => $d->name,
            'settings' => CardSpec::clean((array) $d->settings),
            'updated_at' => $d->updated_at?->toIso8601String(),
        ];
    }
}
