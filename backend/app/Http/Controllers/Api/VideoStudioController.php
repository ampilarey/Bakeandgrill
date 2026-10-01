<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Media\Jobs\ExportStudioVideo;
use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Media\Services\VideoProcessor;
use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class VideoStudioController extends Controller
{
    public function __construct(
        private readonly VideoProcessor $processor,
        private readonly MediaLibraryService $library,
        private readonly AuditLogService $audit,
    ) {}

    public function capabilities(Request $request): JsonResponse
    {
        $this->authorizeStudio($request, viewOnly: true);

        return response()->json([
            'ffmpeg' => $this->processor->available(),
            'tools' => ['trim', 'crop_aspect', 'poster', 'export_muted_mp4'],
            'aspects' => ['original', '16:9', '4:5', '1:1', '9:16'],
        ]);
    }

    public function probe(Request $request): JsonResponse
    {
        $this->authorizeStudio($request);
        if (!$this->processor->available()) {
            return response()->json(['message' => 'FFmpeg is not installed on this server.'], 503);
        }

        $data = $request->validate([
            'source_url' => ['required_without:media_id', 'nullable', 'string', 'max:2048'],
            'media_id' => ['required_without:source_url', 'nullable', 'integer', 'exists:media_assets,id'],
        ]);

        try {
            $absolute = $this->resolveSource($data);
            $meta = $this->processor->probe($absolute);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($meta);
    }

    public function process(Request $request): JsonResponse
    {
        $this->authorizeStudio($request);
        if (!$this->processor->available()) {
            return response()->json(['message' => 'FFmpeg is not installed on this server. Ask hosting to install ffmpeg + ffprobe.'], 503);
        }

        $data = $request->validate([
            'source_url' => ['required_without:media_id', 'nullable', 'string', 'max:2048'],
            'media_id' => ['required_without:source_url', 'nullable', 'integer', 'exists:media_assets,id'],
            'trim_start' => ['nullable', 'numeric', 'min:0'],
            'trim_end' => ['nullable', 'numeric', 'min:0'],
            'aspect' => ['nullable', 'string', 'in:original,16:9,4:5,1:1,9:16'],
            'crop' => ['nullable', 'array'],
            'crop.x' => ['nullable', 'numeric', 'min:0'],
            'crop.y' => ['nullable', 'numeric', 'min:0'],
            'crop.w' => ['nullable', 'numeric', 'min:1'],
            'crop.h' => ['nullable', 'numeric', 'min:1'],
            'poster_at' => ['nullable', 'numeric', 'min:0'],
            'register_library' => ['nullable', 'boolean'],
        ]);

        try {
            $absolute = $this->resolveSource($data);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        // Exported on the worker (media audit, 2026-10-01). The admin polls
        // job(); when the queue is synchronous the export has already
        // finished by the time dispatch returns, and the result goes back
        // at once as it always did.
        $jobId = Str::random(32);
        ExportStudioVideo::queue($jobId);
        ExportStudioVideo::dispatch(
            $jobId,
            $absolute,
            [
                'trim_start' => $data['trim_start'] ?? 0,
                'trim_end' => $data['trim_end'] ?? null,
                'aspect' => $data['aspect'] ?? 'original',
                'crop' => $data['crop'] ?? null,
                'poster_at' => $data['poster_at'] ?? null,
            ],
            (bool) ($data['register_library'] ?? true),
            $request->user()?->id,
        );

        $this->audit->log(
            action: 'media.video_studio.export',
            modelType: Media::class,
            modelId: null,
            oldValues: ['source' => $data['source_url'] ?? $data['media_id'] ?? null],
            newValues: ['job_id' => $jobId],
            meta: [
                'aspect' => $data['aspect'] ?? 'original',
                'trim_start' => $data['trim_start'] ?? 0,
                'trim_end' => $data['trim_end'] ?? null,
            ],
            request: $request,
        );

        return $this->jobResponse($jobId, 201);
    }

    /** GET /api/admin/media/video/jobs/{job} — where an export has got to. */
    public function job(Request $request, string $job): JsonResponse
    {
        $this->authorizeStudio($request, viewOnly: true);

        return $this->jobResponse($job, 200);
    }

    private function jobResponse(string $jobId, int $doneStatus): JsonResponse
    {
        $state = ExportStudioVideo::status($jobId);
        if ($state === null) {
            return response()->json(['message' => 'That export has expired or never existed.'], 404);
        }

        return match ($state['status']) {
            'done' => response()->json(array_merge($state['result'], ['status' => 'done', 'job_id' => $jobId]), $doneStatus),
            'failed' => response()->json(['message' => $state['error'] ?? 'Export failed.', 'status' => 'failed', 'job_id' => $jobId], 422),
            default => response()->json(['status' => $state['status'], 'job_id' => $jobId], 202),
        };
    }

    private function authorizeStudio(Request $request, bool $viewOnly = false): void
    {
        $user = $request->user();
        if (!$user) {
            abort(403);
        }
        $ok = $user->hasPermission('media.manage')
            || $user->hasPermission('website.manage')
            || ($viewOnly && $user->hasPermission('media.view'));
        if (!$ok) {
            abort(403, 'Missing media.manage or website.manage permission.');
        }
    }

    /**
     * @param array<string, mixed> $data
     */
    private function resolveSource(array $data): string
    {
        if (!empty($data['media_id'])) {
            $media = Media::query()->findOrFail((int) $data['media_id']);
            if ($media->media_type !== 'video') {
                throw new \InvalidArgumentException('Selected media is not a video.');
            }

            return $this->processor->resolvePublicPath($media->url ?: ('/storage/' . $media->path));
        }

        return $this->processor->resolvePublicPath((string) $data['source_url']);
    }
}
