<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Printer extends Model
{
    protected $fillable = [
        'name',
        'ip_address',
        'port',
        'type',
        'station',
        'is_active',
        'last_seen_at',
    ];
}
