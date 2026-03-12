<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class XeroSyncLog extends Model
{
    protected $fillable = [
        'resource_type', 'resource_id', 'xero_id',
        'direction', 'status', 'error',
    ];
}
