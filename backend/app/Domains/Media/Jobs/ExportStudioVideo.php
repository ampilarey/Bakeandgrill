<?php

declare(strict_types=1);

namespace App\Domains\Media\Jobs;

use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Media\Services\VideoProcessor;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

/**
 * A Video Studio export (trim, crop, poster) run on the worker (media audit,
 * 2026-10-01), with its progress kept in the cache under a job id the admin
 * polls. The export used to run inside the request and was cut off by the
 * host's request limit on anything but a short clip.
 */
class ExportStudioVideo implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 900;

    private const TTL_MINUTES = 60;

    /** @param array<string, mixed> $options */
    public function __construct(
        public readonly string $jobId,
        public readonly string $sourceAbsolute,
        public readonly array $options,
        public readonly bool $registerLibrary,
        public readonly ?int $userId,
    ) {}

    public static function key(string $jobId): string
    {
        return 'video-studio:job:' . $jobId;
    }

    /** @return array{status: string, result?: array<string, mixed>, error?: string}|null */
    public static function status(string $jobId): ?array
    {
        $state = Cache::get(self::key($jobId));

        return is_array($state) ? $state : null;
    }

    /**
     * Not named queue(): the bus calls a job's queue() to push it, so a
     * method by that name took the push and every export failed (2026-10-08).
     */
    public static function markQueued(string $jobId): void
    {
        Cache::put(self::key($jobId), ['status' => 'queued'], now()->addMinutes(self::TTL_MINUTES));
    }

    public function handle(VideoProcessor $videos, MediaLibraryService $library): void
    {
        Cache::put(self::key($this->jobId), ['status' => 'running'], now()->addMinutes(self::TTL_MINUTES));

        try {
            $result = $videos->process($this->sourceAbsolute, $this->options);

            $mediaId = null;
            if ($this->registerLibrary && Schema::hasTable('media_assets')) {
                try {
                    $registered = $library->registerPath(
                        $result['path'],
                        'studio',
                        $this->userId ? User::query()->find($this->userId) : null,
                        null,
                        $result['poster_url'],
                        null,
                    );
                    $mediaId = $registered->id ?? null;
                } catch (\Throwable) {
                    // best-effort, as before
                }
            }

            Cache::put(self::key($this->jobId), [
                'status' => 'done',
                'result' => [
                    'url' => $result['url'],
                    'poster_url' => $result['poster_url'],
                    'duration' => $result['duration'],
                    'width' => $result['width'],
                    'height' => $result['height'],
                    'media_id' => $mediaId,
                ],
            ], now()->addMinutes(self::TTL_MINUTES));
        } catch (\Throwable $e) {
            Cache::put(self::key($this->jobId), [
                'status' => 'failed',
                'error' => mb_substr($e->getMessage(), 0, 500),
            ], now()->addMinutes(self::TTL_MINUTES));
        }
    }
}
