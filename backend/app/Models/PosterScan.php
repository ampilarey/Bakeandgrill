<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A scan of a printed poster's code. No personal data. */
class PosterScan extends Model
{
    public $timestamps = false;

    protected $fillable = ['poster_id', 'created_at'];

    protected $casts = ['created_at' => 'datetime'];

    public function poster(): BelongsTo
    {
        return $this->belongsTo(Poster::class);
    }
}
