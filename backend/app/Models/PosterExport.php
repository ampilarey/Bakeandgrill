<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PosterExport extends Model
{
    protected $fillable = [
        'poster_id', 'version', 'status', 'request', 'preflight', 'zip_path', 'bytes', 'error',
    ];

    protected $casts = [
        'request' => 'array',
        'preflight' => 'array',
        'version' => 'integer',
        'bytes' => 'integer',
    ];

    public function poster(): BelongsTo
    {
        return $this->belongsTo(Poster::class);
    }
}
