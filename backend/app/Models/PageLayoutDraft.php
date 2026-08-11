<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PageLayoutDraft extends Model
{
    protected $fillable = [
        'user_id',
        'app',
        'page',
        'version',
        'payload',
    ];

    protected $casts = [
        'version' => 'integer',
        'payload' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
