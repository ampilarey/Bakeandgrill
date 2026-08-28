<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One piece of social content. Everything the platforms will receive lives
 * in the immutable `snapshot` (caption, image_url + fingerprint, link_url,
 * price/terms as displayed, offer end date, source refs) — frozen when the
 * post is created/scheduled so later item edits never change a post.
 */
class SocialPost extends Model
{
    public const STATUS_DRAFT = 'draft';

    public const STATUS_AWAITING_APPROVAL = 'awaiting_approval';

    public const STATUS_SCHEDULED = 'scheduled';

    public const STATUS_QUEUED = 'queued';

    public const STATUS_PROCESSING = 'processing';

    public const STATUS_PUBLISHED = 'published';

    public const STATUS_PARTIAL_FAILURE = 'partial_failure';

    public const STATUS_FAILED = 'failed';

    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'status',
        'snapshot',
        'source',
        'source_ref',
        'business_date',
        'created_by',
        'scheduled_at',
        'published_at',
    ];

    protected $casts = [
        'snapshot' => 'array',
        'business_date' => 'date',
        'scheduled_at' => 'datetime',
        'published_at' => 'datetime',
    ];

    public function deliveries(): HasMany
    {
        return $this->hasMany(SocialPostDelivery::class);
    }

    public function caption(): string
    {
        return (string) (($this->snapshot ?? [])['caption'] ?? '');
    }

    public function imageUrl(): ?string
    {
        $url = trim((string) (($this->snapshot ?? [])['image_url'] ?? ''));

        return $url !== '' ? $url : null;
    }

    /** Roll the post state up from its deliveries after each delivery settles. */
    public function refreshStatusFromDeliveries(): void
    {
        $states = $this->deliveries()->pluck('status');
        if ($states->isEmpty()) {
            return;
        }

        $published = $states->filter(fn ($s) => $s === SocialPostDelivery::STATUS_PUBLISHED)->count();
        $pending = $states->filter(fn ($s) => in_array($s, [
            SocialPostDelivery::STATUS_QUEUED,
            SocialPostDelivery::STATUS_PROCESSING,
            SocialPostDelivery::STATUS_SCHEDULED,
        ], true))->count();

        if ($pending > 0) {
            return; // still in flight — leave the coarse state alone
        }

        $this->status = match (true) {
            $published === $states->count() => self::STATUS_PUBLISHED,
            $published > 0 => self::STATUS_PARTIAL_FAILURE,
            default => self::STATUS_FAILED,
        };
        if ($published > 0 && $this->published_at === null) {
            $this->published_at = now();
        }
        $this->save();
    }
}
