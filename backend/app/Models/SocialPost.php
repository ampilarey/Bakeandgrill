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

    public function captionDv(): string
    {
        return trim((string) (($this->snapshot ?? [])['caption_dv'] ?? ''));
    }

    /**
     * The caption a channel gets, by its language setting: both (English,
     * then the Dhivehi under it), English only, or Dhivehi only — falling
     * back to English when no Dhivehi was written.
     */
    public function captionFor(SocialChannel $channel, ?SocialPostDelivery $delivery = null): string
    {
        $en = $this->caption();
        $dv = $this->captionDv();

        $caption = match ($channel->language ?? 'both') {
            'en' => $en,
            'dv' => $dv !== '' ? $dv : $en,
            default => $dv !== '' ? ($en !== '' ? $en . "\n\n" . $dv : $dv) : $en,
        };

        return $delivery !== null ? $this->withTrackedLink($caption, $delivery) : $caption;
    }

    /**
     * The post's link, tagged with the delivery (?s=<id>) wherever it
     * appears in the caption, so a visit and an order can be traced back
     * to the post and the channel it came from.
     */
    public function withTrackedLink(string $caption, SocialPostDelivery $delivery): string
    {
        $link = trim((string) (($this->snapshot ?? [])['link_url'] ?? ''));
        if ($link === '' || !str_contains($caption, $link)) {
            return $caption;
        }
        $tagged = $link . (str_contains($link, '?') ? '&' : '?') . 's=' . $delivery->id;

        return str_replace($link, $tagged, $caption);
    }

    public function imageUrl(): ?string
    {
        $url = trim((string) (($this->snapshot ?? [])['image_url'] ?? ''));

        return $url !== '' ? $url : null;
    }

    /**
     * Every photo of the post: the carousel's list, or the one photo.
     *
     * @return list<string>
     */
    public function images(): array
    {
        $list = ($this->snapshot ?? [])['images'] ?? null;
        if (is_array($list)) {
            $urls = array_values(array_filter(array_map(fn ($u) => trim((string) $u), $list), fn (string $u) => $u !== ''));
            if ($urls !== []) {
                return $urls;
            }
        }
        $one = $this->imageUrl();

        return $one !== null ? [$one] : [];
    }

    public function videoUrl(): ?string
    {
        $url = trim((string) (($this->snapshot ?? [])['video_url'] ?? ''));

        return $url !== '' ? $url : null;
    }

    /** The video's cover frame, else the post's photo. */
    public function videoPosterUrl(): ?string
    {
        $url = trim((string) (($this->snapshot ?? [])['video_poster_url'] ?? ''));

        return $url !== '' ? $url : $this->imageUrl();
    }

    public function videoBytes(): int
    {
        return max(0, (int) (($this->snapshot ?? [])['video_bytes'] ?? 0));
    }

    /** video | carousel | photo | text */
    public function mediaType(): string
    {
        if ($this->videoUrl() !== null) {
            return 'video';
        }
        $images = $this->images();

        return count($images) > 1 ? 'carousel' : ($images !== [] ? 'photo' : 'text');
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
