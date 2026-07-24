<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MediaAssetVersion extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'media_asset_id',
        'path',
        'mime_type',
        'file_size',
        'width',
        'height',
        'created_at',
    ];

    protected $casts = [
        'file_size' => 'integer',
        'width' => 'integer',
        'height' => 'integer',
        'created_at' => 'datetime',
    ];

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'media_asset_id');
    }
}
