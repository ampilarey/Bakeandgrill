<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A comment on one of our posts, pulled from Facebook or Instagram, with
 * whether staff have read it and what they replied. `flagged` marks one
 * that reads like a question about ordering (a phone number, "how much",
 * "deliver"), which is what the hourly SMS is about.
 */
class SocialComment extends Model
{
    protected $fillable = [
        'social_post_delivery_id',
        'provider_comment_id',
        'author',
        'text',
        'posted_at',
        'flagged',
        'read_at',
        'replied_at',
        'reply_text',
        'reply_provider_id',
    ];

    protected $casts = [
        'posted_at' => 'datetime',
        'flagged' => 'boolean',
        'read_at' => 'datetime',
        'replied_at' => 'datetime',
    ];

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(SocialPostDelivery::class, 'social_post_delivery_id');
    }

    /** Does the text read like somebody wanting to order? */
    public static function looksLikeAnOrder(string $text): bool
    {
        $t = mb_strtolower($text);
        if (preg_match('/(\+?960[\s-]?)?\b[79]\d{2}[\s-]?\d{4}\b/', $t) === 1) {
            return true; // a Maldivian mobile number
        }

        return preg_match('/\b(order|price|how much|deliver|delivery|available|book|reserve|dm|inbox|pm me|ban+dhu|agu|vikkaa|ge+n+|ގެންނަ|އޯޑަރ|އަގު|ކިހާވަރެ)\b/u', $t) === 1;
    }
}
