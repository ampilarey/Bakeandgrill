<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PageBlockSharedContent extends Model
{
    protected $fillable = [
        'uuid',
        'block_type',
        'settings',
    ];

    protected $casts = [
        'settings' => 'array',
    ];

    public function blocks(): HasMany
    {
        return $this->hasMany(PageBlock::class, 'shared_content_id');
    }
}
