<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PageLayoutRevision extends Model
{
    protected $fillable = [
        'user_id',
        'app',
        'page',
        'version',
        'payload',
        'is_draft',
        'published_at',
    ];

    protected $casts = [
        'version' => 'integer',
        'payload' => 'array',
        'is_draft' => 'boolean',
        'published_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
