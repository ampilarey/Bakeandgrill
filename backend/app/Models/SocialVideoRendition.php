<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * One rendered social video: item × format. The source fingerprint covers
 * the photo set, item name and effective price — when any of those change
 * the rendition is stale and regenerating replaces it (and its files).
 */
class SocialVideoRendition extends Model
{
    public const FORMATS = [
        'vertical' => ['width' => 720, 'height' => 1280],   // Reels / Stories / TikTok
        'square' => ['width' => 720, 'height' => 720],      // feed
        'landscape' => ['width' => 1280, 'height' => 720],  // FB / Telegram / Viber
    ];

    public const STATUS_QUEUED = 'queued';

    public const STATUS_PROCESSING = 'processing';

    public const STATUS_READY = 'ready';

    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'item_id',
        'format',
        'status',
        'source_fingerprint',
        'width',
        'height',
        'bytes',
        'mime',
        'path',
        'poster_path',
        'error_message',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function url(): ?string
    {
        return $this->path ? Storage::disk('public')->url($this->path) : null;
    }

    public function posterUrl(): ?string
    {
        return $this->poster_path ? Storage::disk('public')->url($this->poster_path) : null;
    }

    /** Remove the rendered files (used when replacing or deleting). */
    public function deleteFiles(): void
    {
        foreach ([$this->path, $this->poster_path] as $path) {
            if ($path) {
                Storage::disk('public')->delete($path);
            }
        }
    }
}
