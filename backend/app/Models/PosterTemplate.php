<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PosterTemplate extends Model
{
    protected $fillable = [
        'name', 'template_key', 'layout', 'theme', 'mood', 'language', 'slots', 'sizes', 'bindings', 'locked', 'created_by',
    ];

    protected $casts = [
        'slots' => 'array',
        'sizes' => 'array',
        'bindings' => 'array',
        'locked' => 'boolean',
    ];
}
