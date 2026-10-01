<?php

declare(strict_types=1);

namespace App\Domains\Media\Jobs;

use App\Domains\Media\Services\VideoProcessor;
use App\Models\ItemPhoto;
use App\Models\Media;
use App\Support\MediaFileCleaner;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Makes an uploaded clip web-safe (H.264 MP4) in the background (media
 * audit, 2026-10-01).
 *
 * This ran inside the upload request before, for up to five minutes, while
 * the browser waited. Shared hosts stop a request long before that, so a
 * longer clip failed midway and the upload was thrown away. Now the row is
 * saved first with processing_status "processing", the admin shows it as
 * converting, customers do not see it, and this job finishes it off.
 */
class ConvertUploadedVideo implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 600;

    public const PROCESSING = 'processing';

    public const FAILED = 'failed';

    /** @param 'item_photo'|'media' $kind */
    public function __construct(public readonly string $kind, public readonly int $id) {}

    public function handle(VideoProcessor $videos): void
    {
        $row = $this->kind === 'media' ? Media::query()->find($this->id) : ItemPhoto::query()->find($this->id);
        if ($row === null) {
            return;
        }

        $relative = $this->kind === 'media'
            ? ltrim((string) $row->path, '/')
            : (string) MediaFileCleaner::storagePathFromUrl((string) $row->url);

        try {
            if ($relative === '' || !Storage::disk('public')->exists($relative)) {
                throw new \RuntimeException('The uploaded clip is missing.');
            }
            $safe = $videos->ensureWebSafe(Storage::disk('public')->path($relative));

            if ($this->kind === 'media') {
                $row->forceFill([
                    'path' => $safe['relative_path'],
                    'mime_type' => $safe['mime'],
                    'file_size' => (int) (@filesize($safe['absolute_path']) ?: 0),
                    'processing_status' => null,
                    'processing_error' => null,
                ])->save();
            } else {
                $row->forceFill([
                    'url' => '/storage/' . ltrim($safe['relative_path'], '/'),
                    'processing_status' => null,
                    'processing_error' => null,
                ])->save();
            }
        } catch (\Throwable $e) {
            Log::warning('media.video_conversion_failed', ['kind' => $this->kind, 'id' => $this->id, 'error' => $e->getMessage()]);
            $row->forceFill([
                'processing_status' => self::FAILED,
                'processing_error' => mb_substr($e->getMessage(), 0, 500),
            ])->save();
        }
    }

    /**
     * Save the row, then convert: inline when the queue is synchronous (tests,
     * a host with no worker), otherwise on the worker.
     */
    public static function start(string $kind, int $id): void
    {
        self::dispatch($kind, $id)->afterCommit();
    }
}
