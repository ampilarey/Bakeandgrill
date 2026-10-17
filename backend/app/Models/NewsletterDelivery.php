<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One address for one issue; unique, so an address is never sent an issue twice. */
class NewsletterDelivery extends Model
{
    protected $fillable = ['issue_id', 'subscriber_id', 'email', 'locale', 'status', 'sent_at', 'error'];

    protected $casts = ['sent_at' => 'datetime'];

    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(NewsletterSubscriber::class, 'subscriber_id');
    }
}
