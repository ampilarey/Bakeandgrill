<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Posters\PaperSize;
use App\Domains\Posters\PosterContent;
use App\Domains\Posters\PosterImposition;
use App\Domains\Posters\PosterMoods;
use App\Domains\Posters\PosterPieces;
use App\Domains\Posters\PosterPreflight;
use App\Domains\Posters\PosterPurposes;
use App\Http\Controllers\Controller;
use App\Jobs\ExportPosterJob;
use App\Models\Category;
use App\Models\Item;
use App\Models\Poster;
use App\Models\PosterExport;
use App\Models\PosterTemplate;
use App\Models\Promotion;
use App\Models\RestaurantTable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * The Posters page API (docs/POSTER_PLAN.md § 5). Making and downloading
 * needs posters.make; locking or deleting a template needs posters.manage.
 */
class PosterController extends Controller
{
    public function catalog(): JsonResponse
    {
        $counts = Poster::query()
            ->select('template_key', DB::raw('COUNT(*) as used'))
            ->groupBy('template_key')
            ->pluck('used', 'template_key');

        return response()->json([
            'purposes' => collect(PosterPurposes::all())->map(fn (array $p, string $key) => [
                'key' => $key,
                'label' => $p['label'],
                'group' => $p['group'],
                'layout' => $p['layout'],
                'bind' => $p['bind'],
                'landscape' => $p['landscape'],
                'external' => $p['external'],
                'slots' => $p['slots'],
                'used' => (int) ($counts[$key] ?? 0),
            ])->values(),
            'layouts' => PosterPurposes::layouts(),
            'moods' => array_keys(PosterMoods::all()),
            'sizes' => array_keys(PaperSize::SIZES),
            'places' => Poster::PLACES,
            'materials' => collect(PosterPreflight::MATERIALS)->map(fn (array $m, string $key) => [
                'key' => $key, 'label' => $m['label'], 'white' => $m['white'],
            ])->values(),
        ]);
    }

    public function lookups(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $like = '%' . $q . '%';

        $items = Item::query()->where('is_active', true)
            ->when($q !== '', fn ($b) => $b->where('name', 'like', $like))
            ->orderBy('name')->limit(80)->get(['id', 'name', 'name_dv', 'base_price', 'image_url', 'category_id'])
            ->map(fn (Item $item) => [
                'id' => $item->id,
                'name' => $item->name,
                'name_dv' => $item->name_dv,
                'price' => $item->displayPriceInfo(),
            ]);
        $categories = Category::query()->orderBy('name')->limit(80)->get(['id', 'name', 'name_dv']);
        $promotions = Promotion::query()->where('is_active', true)->orderByDesc('id')->limit(40)
            ->get(['id', 'name', 'type', 'discount_value', 'code', 'expires_at', 'starts_time', 'ends_time']);
        $tables = RestaurantTable::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']);

        return response()->json(compact('items', 'categories', 'promotions', 'tables'));
    }

    public function preview(Request $request): JsonResponse
    {
        $poster = $this->validated($request);
        $sizeName = (string) ($poster['sizes'][0] ?? 'A4');
        $paper = PaperSize::named($sizeName, (bool) $poster['landscape']);
        $content = PosterContent::resolve($poster);
        $built = PosterPieces::build($poster, $paper, $content);
        $job = $request->only(['material', 'white', 'gloss', 'mounting']);

        return response()->json([
            'content' => $content,
            'sheet' => $this->previewSheet($built),
            'preflight' => PosterPreflight::check($poster, $content, $built, $paper, $job),
            'imposition' => PosterImposition::plan($paper, (string) $request->input('imposition', 'single'))['label'],
        ]);
    }

    public function index(): JsonResponse
    {
        $rows = Poster::query()->orderByDesc('pinned')->orderByDesc('id')->limit(200)->get()
            ->map(fn (Poster $p) => $this->summary($p));

        return response()->json([
            'posters' => $rows,
            'should_be_down' => $rows->where('should_be_down', true)->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $content = PosterContent::resolve($data);
        $poster = Poster::query()->create([
            ...$data,
            'name' => $data['name'] !== '' ? $data['name'] : (PosterPurposes::get($data['template_key'])['label'] ?? 'Poster'),
            'take_down_on' => $data['take_down_on'] ?? $content['take_down_on'],
            'created_by' => $request->user()?->id,
        ]);

        return response()->json($this->summary($poster), 201);
    }

    public function show(Poster $poster): JsonResponse
    {
        return response()->json($poster->load('exports'));
    }

    public function update(Request $request, Poster $poster): JsonResponse
    {
        $data = $this->validated($request, partial: true);
        $poster->fill($data)->save();

        return response()->json($this->summary($poster));
    }

    public function destroy(Poster $poster): JsonResponse
    {
        $poster->delete();

        return response()->json(['ok' => true]);
    }

    public function duplicate(Poster $poster): JsonResponse
    {
        $copy = $poster->replicate(['version']);
        $copy->name = $poster->name . ' copy';
        $copy->state = 'draft';
        $copy->pinned = false;
        $copy->version = 1;
        $copy->save();

        return response()->json($this->summary($copy), 201);
    }

    public function export(Request $request, Poster $poster): JsonResponse
    {
        $job = $request->validate([
            'sizes' => ['nullable', 'array'],
            'sizes.*' => ['string'],
            'material' => ['nullable', 'string'],
            'finish' => ['nullable', 'string'],
            'mounting' => ['nullable', 'string'],
            'imposition' => ['nullable', 'string'],
            'quantity' => ['nullable', 'array'],
            'white' => ['nullable', 'string'],
            'gloss' => ['nullable', 'string'],
            'masks' => ['nullable', 'boolean'],
            'deadline' => ['nullable', 'string'],
        ]);
        $job['sizes'] = $job['sizes'] ?? $poster->sizes;
        $job['material'] = $job['material'] ?? 'foam';
        $job['white'] = $job['white'] ?? ((PosterPreflight::MATERIALS[$job['material']]['white'] ?? false) ? 'under all printed areas' : 'none');
        $job['gloss'] = $job['gloss'] ?? 'none';
        $job['masks'] = (bool) ($job['masks'] ?? false);
        $job['imposition'] = $job['imposition'] ?? 'single';
        $job['mounting'] = $job['mounting'] ?? 'none';
        $job['finish'] = $job['finish'] ?? 'matte';

        $paper = PaperSize::named((string) ($job['sizes'][0] ?? 'A4'), (bool) $poster->landscape);
        $content = PosterContent::resolve($poster->toArray());
        $built = PosterPieces::build($poster->toArray(), $paper, $content);
        $checks = PosterPreflight::check($poster->toArray(), $content, $built, $paper, $job);
        if (PosterPreflight::blocked($checks)) {
            return response()->json(['message' => 'Preflight failed.', 'preflight' => [$paper->name => $checks]], 422);
        }

        $export = PosterExport::query()->create([
            'poster_id' => $poster->id,
            'version' => $poster->version,
            'status' => 'queued',
            'request' => $job,
            'preflight' => [$paper->name => $checks],
        ]);
        ExportPosterJob::dispatch($export->id);

        return response()->json($export->fresh(), 202);
    }

    public function download(PosterExport $export): BinaryFileResponse|JsonResponse
    {
        if ($export->status !== 'ready' || !is_string($export->zip_path) || !is_file($export->zip_path)) {
            return response()->json(['message' => 'Not ready yet.', 'status' => $export->status, 'error' => $export->error], 409);
        }
        $poster = $export->poster;

        return response()->download($export->zip_path, 'BG-' . ($poster?->code() ?? $export->id) . '.zip');
    }

    public function templates(): JsonResponse
    {
        return response()->json(PosterTemplate::query()->orderByDesc('id')->get());
    }

    public function storeTemplate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'template_key' => ['required', 'string'],
            'layout' => ['required', 'string'],
            'mood' => ['nullable', 'string'],
            'language' => ['nullable', 'string'],
            'slots' => ['nullable', 'array'],
        ]);
        $data['created_by'] = $request->user()?->id;
        $data['locked'] = false;

        return response()->json(PosterTemplate::query()->create($data), 201);
    }

    public function updateTemplate(Request $request, PosterTemplate $template): JsonResponse
    {
        if (!$request->user()?->hasPermission('posters.manage')) {
            abort(403);
        }
        $template->fill($request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'locked' => ['sometimes', 'boolean'],
            'slots' => ['sometimes', 'array'],
        ]))->save();

        return response()->json($template);
    }

    public function destroyTemplate(Request $request, PosterTemplate $template): JsonResponse
    {
        if (!$request->user()?->hasPermission('posters.manage')) {
            abort(403);
        }
        $template->delete();

        return response()->json(['ok' => true]);
    }

    /** @return array<string, mixed> */
    private function summary(Poster $poster): array
    {
        return [
            'id' => $poster->id,
            'code' => $poster->code(),
            'name' => $poster->name,
            'template_key' => $poster->template_key,
            'layout' => $poster->layout,
            'mood' => $poster->mood,
            'language' => $poster->language,
            'landscape' => $poster->landscape,
            'sizes' => $poster->sizes,
            'slots' => $poster->slots,
            'bindings' => $poster->bindings,
            'state' => $poster->state,
            'take_down_on' => $poster->take_down_on?->toDateString(),
            'place' => $poster->place,
            'pinned' => $poster->pinned,
            'version' => $poster->version,
            'should_be_down' => $poster->shouldBeDown(),
            'updated_at' => $poster->updated_at?->toIso8601String(),
        ];
    }

    /**
     * The piece list, without server file paths, for the on-screen preview.
     *
     * @param array<string, mixed> $built
     * @return array<string, mixed>
     */
    private function previewSheet(array $built): array
    {
        $pieces = [];
        foreach ($built['pieces'] as $piece) {
            if (($piece['type'] ?? '') === 'skip') {
                continue;
            }
            unset($piece['path'], $piece['cmyk']);
            $pieces[] = $piece;
        }

        return [
            'w' => $built['w'],
            'h' => $built['h'],
            'hex_bg' => $built['hex_bg'],
            'pieces' => $pieces,
        ];
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $data = $request->validate([
            'name' => [$partial ? 'sometimes' : 'nullable', 'string', 'max:160'],
            'template_key' => [$req, 'string'],
            'layout' => [$req, 'string'],
            'mood' => ['nullable', 'string'],
            'language' => ['nullable', 'in:en,dv,both'],
            'landscape' => ['nullable', 'boolean'],
            'sizes' => [$partial ? 'sometimes' : 'nullable', 'array'],
            'sizes.*' => ['string'],
            'slots' => ['nullable', 'array'],
            'bindings' => ['nullable', 'array'],
            'state' => ['nullable', 'in:draft,ready,up,down'],
            'take_down_on' => ['nullable', 'date'],
            'place' => ['nullable', 'string'],
            'pinned' => ['nullable', 'boolean'],
        ]);
        if (!$partial || array_key_exists('template_key', $data)) {
            $key = (string) ($data['template_key'] ?? '');
            if (PosterPurposes::get($key) === null) {
                abort(422, 'Unknown purpose.');
            }
        }
        if (!$partial) {
            $data['mood'] = $data['mood'] ?? 'dark';
            $data['language'] = $data['language'] ?? 'both';
            $data['landscape'] = (bool) ($data['landscape'] ?? false);
            $data['sizes'] = array_values($data['sizes'] ?? ['A4']);
            $data['slots'] = $data['slots'] ?? [];
            $data['bindings'] = $data['bindings'] ?? [];
            $data['name'] = trim((string) ($data['name'] ?? ''));
        } elseif (array_key_exists('name', $data)) {
            $data['name'] = trim((string) $data['name']);
        }
        if (isset($data['place']) && $data['place'] !== null && !in_array($data['place'], Poster::PLACES, true)) {
            abort(422, 'Unknown place.');
        }

        return $data;
    }
}
