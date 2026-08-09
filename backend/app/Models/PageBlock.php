<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PageBlock extends Model
{
    public const APP_WEBSITE = 'website';

    public const APP_ORDER = 'order_app';

    public const PAGE_HOME = 'home';

    public const MODE_SHARED = 'shared';

    public const MODE_OWN = 'own';

    protected $fillable = [
        'app',
        'page',
        'block_type',
        'position',
        'is_enabled',
        'content_mode',
        'settings',
    ];

    protected $casts = [
        'position' => 'integer',
        'is_enabled' => 'boolean',
        'settings' => 'array',
    ];
}
