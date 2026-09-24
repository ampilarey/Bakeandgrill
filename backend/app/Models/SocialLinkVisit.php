<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One visit to a link that carried a post's tracking tag (?s=<delivery>). */
class SocialLinkVisit extends Model
{
    public $timestamps = false;

    protected $fillable = ['social_post_delivery_id', 'path', 'visitor_hash', 'created_at'];

    protected $casts = ['created_at' => 'datetime'];

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(SocialPostDelivery::class, 'social_post_delivery_id');
    }
}
