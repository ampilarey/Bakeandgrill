<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One post × one channel: the delivery state machine.
 *
 * `unknown` is deliberate — a timeout after the provider may have accepted
 * the post is NOT retried blindly; it is reconciled against the provider
 * first (the platform may already show the post).
 */
class SocialPostDelivery extends Model
{
    public const STATUS_QUEUED = 'queued';

    public const STATUS_SCHEDULED = 'scheduled';

    public const STATUS_PROCESSING = 'processing';

    public const STATUS_PUBLISHED = 'published';

    public const STATUS_FAILED = 'failed';

    public const STATUS_SKIPPED = 'skipped';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_UNKNOWN = 'unknown';

    public const ERROR_AUTH = 'auth';

    public const ERROR_VALIDATION = 'validation';

    public const ERROR_RATE_LIMIT = 'rate_limit';

    public const ERROR_TRANSIENT = 'transient';

    public const ERROR_UNKNOWN = 'unknown';

    public const ERROR_ENVIRONMENT_GUARD = 'environment_guard';

    protected $fillable = [
        'social_post_id',
        'social_channel_id',
        'status',
        'dedupe_key',
        'provider_container_id',
        'provider_post_id',
        'permalink',
        'error_class',
        'error_message',
        'attempts',
        'published_at',
    ];

    protected $casts = [
        'attempts' => 'array',
        'published_at' => 'datetime',
    ];

    public function post(): BelongsTo
    {
        return $this->belongsTo(SocialPost::class, 'social_post_id');
    }

    public function channel(): BelongsTo
    {
        return $this->belongsTo(SocialChannel::class, 'social_channel_id');
    }

    public function recordAttempt(string $outcome, ?string $error = null): void
    {
        $attempts = $this->attempts ?? [];
        $attempts[] = array_filter([
            'at' => now()->toIso8601String(),
            'outcome' => $outcome,
            'error' => $error,
        ], fn ($v) => $v !== null);
        $this->attempts = $attempts;
    }
}
