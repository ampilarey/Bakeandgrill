<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Posters\PaperSize;
use App\Domains\Posters\PosterBanner;
use App\Domains\Posters\PosterContent;
use App\Domains\Posters\PosterImposition;
use App\Domains\Posters\PosterMoods;
use App\Domains\Posters\PosterPhoto;
use App\Domains\Posters\PosterPieces;
use App\Domains\Posters\PosterPreflight;
use App\Domains\Posters\PosterPurposes;
use App\Domains\Posters\PosterStaleness;
use App\Domains\Posters\PosterThemes;
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
use Illuminate\Validation\ValidationException;
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
                'key' => $key, 'label' => $m['label'], 'white' => $m['white'], 'mirror' => (bool) ($m['mirror'] ?? false),
            ])->values(),
            'themes' => $this->themeCatalog(),
        ]);
    }

    /**
     * One ready-made design with both variants (canvas, logo, QR, photo and
     * text slots) and the links the editor draws it from.
     */
    public function theme(string $key): JsonResponse
    {
        $theme = PosterThemes::get($key);
        if ($theme === null) {
            abort(404, 'Unknown template.');
        }
        $variants = [];
        foreach ($theme['variants'] as $name => $variant) {
            $slots = [];
            foreach ($variant['photo_slots'] as $slot) {
                $slot['placeholder_url'] = $this->themeFileUrl($key, (string) $slot['placeholder_image']);
                $slots[] = $slot;
            }
            $variant['photo_slots'] = $slots;
            $variant['urls'] = [
                'preview' => $this->themeFileUrl($key, (string) $variant['files']['preview']),
                'backdrop' => $this->themeFileUrl($key, (string) $variant['files']['backdrop_svg']),
            ];
            unset($variant['print_files']);
            $variants[$name] = $variant;
        }
        $theme['variants'] = $variants;
        $theme['fonts'] = PosterThemes::FONTS;

        return response()->json($theme);
    }

    /** A theme's preview, backdrop SVG or placeholder picture (PosterThemes::FILE_PATTERN). */
    public function themeFile(string $key, string $file): BinaryFileResponse
    {
        $path = PosterThemes::file($key, $file);
        if ($path === null) {
            abort(404);
        }

        return response()->file($path, ['Cache-Control' => 'private, max-age=86400']);
    }

    /** A photo uploaded for posters, for the on-screen preview of a template's photo slot. */
    public function photo(string $name): BinaryFileResponse
    {
        $path = PosterPhoto::uploadPath(PosterPhoto::UPLOAD_DIR . '/' . $name);
        if ($path === null) {
            abort(404);
        }

        return response()->file($path, ['Cache-Control' => 'private, max-age=3600']);
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
        $paper = PaperSize::named($sizeName, (bool) $poster['landscape'])->mounted((string) $request->input('mounting', 'none'));
        $content = PosterContent::resolve($poster);
        $built = PosterPieces::build($poster, $paper, $content);
        $job = $request->only(['material', 'white', 'gloss', 'mounting', 'layers', 'white_name', 'gloss_name']);

        return response()->json([
            'content' => $content,
            'sheet' => $this->previewSheet($built),
            'preflight' => PosterPreflight::check($poster, $content, $built, $paper, $job),
            'imposition' => PosterImposition::plan($paper, (string) $request->input('imposition', 'single'))['label'],
        ]);
    }

    public function index(): JsonResponse
    {
        $bannerCodes = PosterBanner::codes();
        $rows = Poster::query()->with(['latestReady', 'latestOrder.shop'])->withCount('scans')->orderByDesc('pinned')->orderByDesc('id')->limit(200)->get()
            ->map(fn (Poster $p) => $this->summary($p, $bannerCodes));

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
        if ($poster->theme !== null) {
            // A template poster stays one: its design is swapped, never dropped, and it stays portrait.
            if (array_key_exists('theme', $data) && $data['theme'] === null) {
                abort(422, 'A template poster keeps a template. Make a new poster for a classic layout.');
            }
            if (($data['landscape'] ?? false) === true) {
                abort(422, 'Templates are portrait only.');
            }
            if (array_key_exists('template_key', $data) && $data['template_key'] !== PosterPurposes::THEMED) {
                abort(422, 'A template poster keeps its template purpose.');
            }
        }
        $poster->fill($data)->save();

        return response()->json($this->summary($poster));
    }

    public function destroy(Poster $poster): JsonResponse
    {
        $photo = (string) (($poster->slots ?? [])['photo_path'] ?? '');
        $poster->delete();
        // Its poster photo goes too, unless a copy of the poster still uses it.
        $file = PosterPhoto::uploadPath($photo);
        if ($file !== null && !Poster::query()->where('slots', 'like', '%' . basename($photo) . '%')->exists()) {
            @unlink($file);
        }

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

        $paper = PaperSize::named((string) ($job['sizes'][0] ?? 'A4'), (bool) $poster->landscape)->mounted((string) $job['mounting']);
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

    /**
     * A photo for posters only (docs/POSTER_PLAN.md § 7): kept up to 4800 px on
     * the long edge, where menu photos stop at 3200. The page puts the returned
     * path in the poster's `photo_path` slot.
     */
    public function uploadPhoto(Request $request): JsonResponse
    {
        $request->validate(['photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:30720']]);
        try {
            $path = PosterPhoto::storeUpload((string) $request->file('photo')->getRealPath());
        } catch (\RuntimeException $e) {
            return response()->json(['message' => 'That picture could not be read. Try a JPEG or PNG.'], 422);
        }
        $info = @getimagesize((string) PosterPhoto::uploadPath($path));

        return response()->json(['photo_path' => $path, 'width' => (int) ($info[0] ?? 0), 'height' => (int) ($info[1] ?? 0)], 201);
    }

    /** Where an export stands (queued, ready, failed), for the page to wait on before downloading. */
    public function exportStatus(PosterExport $export): JsonResponse
    {
        return response()->json($export->only(['id', 'poster_id', 'version', 'status', 'error', 'preflight', 'bytes', 'created_at', 'updated_at']));
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
            'theme' => ['nullable', 'string', 'max:64'],
            'mood' => ['nullable', 'string'],
            'language' => ['nullable', 'string'],
            'slots' => ['nullable', 'array'],
            'slots.*' => [$this->slotRule()],
        ]);
        if (isset($data['theme'])) {
            if (!PosterThemes::has((string) $data['theme'])) {
                abort(422, 'Unknown template.');
            }
            $data['template_key'] = PosterPurposes::THEMED;
            $data['layout'] = PosterPurposes::THEMED;
        } elseif (($data['template_key'] ?? '') === PosterPurposes::THEMED) {
            abort(422, 'Pick a template.');
        }
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
            'slots.*' => [$this->slotRule()],
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

    /**
     * @param list<string> $bannerCodes
     * @return array<string, mixed>
     */
    private function summary(Poster $poster, array $bannerCodes = []): array
    {
        $previous = $poster->relationLoaded('latestReady') ? $poster->latestReady : null;
        $stale = false;
        $diff = is_string($previous?->diff) ? $previous->diff : '';
        if ($previous !== null && is_string($previous->bound_hash) && $previous->bound_hash !== '') {
            $snapshot = PosterStaleness::snapshot($poster);
            $stale = PosterStaleness::hash($snapshot) !== $previous->bound_hash;
            if ($stale) {
                $diff = PosterStaleness::diff(is_array($previous->snapshot) ? $previous->snapshot : null, $snapshot);
            }
        }

        return [
            'id' => $poster->id,
            'code' => $poster->code(),
            'name' => $poster->name,
            'template_key' => $poster->template_key,
            'layout' => $poster->layout,
            'theme' => $poster->theme,
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
            'scans' => (int) ($poster->scans_count ?? $poster->scans()->count()),
            'banner' => in_array($poster->code(), $bannerCodes, true),
            'stale' => $stale,
            'diff' => $diff,
            'order' => $poster->relationLoaded('latestOrder') && $poster->latestOrder ? [
                'id' => $poster->latestOrder->id,
                'state' => $poster->latestOrder->state,
                'shop' => $poster->latestOrder->shop?->name,
                'quote_mvr' => $poster->latestOrder->quote_mvr,
            ] : null,
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
        $theme = is_array($built['theme'] ?? null) ? $built['theme'] : null;
        $pieces = [];
        foreach ($built['pieces'] as $piece) {
            if (($piece['type'] ?? '') === 'skip') {
                continue;
            }
            // Server paths, press ink and the artwork's op lists stay here: the page draws the
            // backdrop from its SVG, a photo from its picture's address and its clip path.
            unset($piece['path'], $piece['cmyk'], $piece['fill_behind'], $piece['clip_ops'], $piece['items']);
            if (($piece['type'] ?? '') === 'photo' && $theme !== null) {
                $piece['src'] = $this->photoSrc($piece, (string) $theme['key']);
                unset($piece['url']);
            }
            if (is_array($piece['shadow'] ?? null)) {
                unset($piece['shadow']['cmyk']);
            }
            if (is_array($piece['badge'] ?? null)) {
                unset($piece['badge']['cmyk']);
            }
            $pieces[] = $piece;
        }
        $sheet = [
            'w' => $built['w'],
            'h' => $built['h'],
            'hex_bg' => $built['hex_bg'],
            'pieces' => $pieces,
        ];
        if ($theme !== null) {
            $sheet['theme'] = $theme + ['backdrop_url' => $this->themeFileUrl((string) $theme['key'], 'backdrop-' . $theme['variant'] . '.svg')];
        }

        return $sheet;
    }

    /**
     * Where the page loads a template's photo slot from: the poster upload
     * route, the dish's public picture, or the design's placeholder.
     *
     * @param array<string, mixed> $piece
     */
    private function photoSrc(array $piece, string $themeKey): ?string
    {
        return match ((string) ($piece['source'] ?? 'placeholder')) {
            'upload' => url('/api/posters/photo/' . basename((string) $piece['photo_path'])),
            'placeholder' => $this->themeFileUrl($themeKey, (string) $piece['placeholder_image']),
            default => is_string($piece['url'] ?? null) && $piece['url'] !== ''
                ? (str_starts_with($piece['url'], 'http') ? $piece['url'] : url($piece['url']))
                : null,
        };
    }

    /**
     * The catalogue of ready-made designs for the picker: categories with
     * counts, the style labels, the size → variant map and every theme with
     * its two preview pictures.
     *
     * @return array<string, mixed>
     */
    private function themeCatalog(): array
    {
        return [
            'categories' => PosterThemes::categories(),
            'styles' => PosterThemes::styles(),
            'sizes' => PosterThemes::SIZE_VARIANTS,
            'themes' => array_map(fn (array $row): array => [
                'id' => $row['id'],
                'key' => $row['key'],
                'title' => $row['title'],
                'category' => $row['category'],
                'style' => $row['style'],
                'style_label' => $row['style_label'],
                'has_photo' => $row['has_photo'],
                'photo_slots' => $row['photo_slots'],
                'text_slots' => $row['text_slots'],
                'preview_url' => $this->themeFileUrl($row['key'], 'preview-large.jpg'),
                'preview_small_url' => $this->themeFileUrl($row['key'], 'preview-small.jpg'),
            ], PosterThemes::all()),
        ];
    }

    private function themeFileUrl(string $key, string $file): string
    {
        return url('/api/posters/themes/' . $key . '/' . $file);
    }

    /**
     * One entry of `slots`: a typed line (any classic slot, or a template's
     * t1…; `false` is a line the owner blanked, since an empty string arrives
     * as null and null means the design's own wording), or for a template's
     * photo slot (p1…) null or the choice `{item_id, use}` / `{photo_path}`.
     */
    private function slotRule(): \Closure
    {
        return static function (string $attribute, mixed $value, \Closure $fail): void {
            $key = (string) substr($attribute, (int) strrpos($attribute, '.') + 1);
            if (preg_match('/^[a-z_][a-z0-9_]{0,31}$/', $key) !== 1) {
                $fail('That slot name is not allowed.');

                return;
            }
            if (preg_match('/^p[1-9]\d*$/', $key) === 1) {
                if ($value === null) {
                    return;
                }
                if (!is_array($value)) {
                    $fail('A photo slot takes a photo choice.');

                    return;
                }
                foreach ($value as $field => $v) {
                    $ok = match ($field) {
                        'item_id' => $v === null || (is_int($v) && $v > 0) || (is_string($v) && ctype_digit($v) && (int) $v > 0),
                        'use' => $v === null || in_array($v, ['main', 'cutout'], true),
                        'photo_path' => $v === null || (is_string($v) && strlen($v) <= 120),
                        default => false,
                    };
                    if (!$ok) {
                        $fail("The photo choice's \"{$field}\" is not allowed.");

                        return;
                    }
                }

                return;
            }
            if ($value !== null && $value !== false && !is_string($value)) {
                $fail('A text slot takes words.');

                return;
            }
            if (is_string($value) && mb_strlen($value) > 600) {
                $fail('A text slot takes up to 600 characters.');
            }
        };
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $data = $request->validate([
            'name' => [$partial ? 'sometimes' : 'nullable', 'string', 'max:160'],
            'template_key' => [$req, 'string'],
            'layout' => [$req, 'string'],
            'theme' => ['nullable', 'string', 'max:64'],
            'mood' => ['nullable', 'string'],
            'language' => ['nullable', 'in:en,dv,both'],
            'landscape' => ['nullable', 'boolean'],
            'sizes' => [$partial ? 'sometimes' : 'nullable', 'array'],
            'sizes.*' => ['string'],
            'slots' => ['nullable', 'array'],
            'slots.*' => [$this->slotRule()],
            'bindings' => ['nullable', 'array'],
            'state' => ['nullable', 'in:draft,ready,up,down'],
            'take_down_on' => ['nullable', 'date'],
            'place' => ['nullable', 'string'],
            'pinned' => ['nullable', 'boolean'],
        ]);
        if (isset($data['theme'])) {
            // A ready-made design: the theme decides the purpose and the layout (docs/POSTER_THEMES_HANDOFF.md § 5).
            if (!PosterThemes::has((string) $data['theme'])) {
                abort(422, 'Unknown template.');
            }
            if (($data['landscape'] ?? false) === true) {
                abort(422, 'Templates are portrait only.');
            }
            $data['template_key'] = PosterPurposes::THEMED;
            $data['layout'] = PosterPurposes::THEMED;
        } elseif (($data['template_key'] ?? '') === PosterPurposes::THEMED && !$partial) {
            abort(422, 'Pick a template.');
        }
        if (!$partial || array_key_exists('template_key', $data)) {
            $key = (string) ($data['template_key'] ?? '');
            $purpose = PosterPurposes::get($key);
            if ($purpose === null) {
                abort(422, 'Unknown purpose.');
            }
            // A purpose drawn elsewhere (the complaint poster) is opened there, never made here, so one engine draws it.
            if (($purpose['external'] ?? null) !== null) {
                abort(422, 'This poster is made on its own page: ' . $purpose['external']);
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
