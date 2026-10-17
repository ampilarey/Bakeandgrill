<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One newsletter, written in English and Dhivehi (iruali import plan, feature 4). */
class NewsletterIssue extends Model
{
    public const DRAFT = 'draft';

    public const SENDING = 'sending';

    public const SENT = 'sent';

    protected $fillable = ['subject_en', 'subject_dv', 'body_en', 'body_dv', 'header_image_url', 'sections', 'removed_item_ids', 'frozen', 'status', 'sent_at', 'created_by'];

    protected $casts = ['sections' => 'array', 'removed_item_ids' => 'array', 'frozen' => 'array', 'sent_at' => 'datetime'];

    public function deliveries(): HasMany
    {
        return $this->hasMany(NewsletterDelivery::class, 'issue_id');
    }
}
