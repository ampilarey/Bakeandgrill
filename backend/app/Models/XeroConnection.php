<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class XeroConnection extends Model
{
    protected $fillable = [
        'tenant_id', 'tenant_name', 'access_token', 'refresh_token',
        'token_expires_at', 'connected_at', 'active',
    ];

    protected $casts = [
        'token_expires_at' => 'datetime',
        'connected_at'     => 'datetime',
        'active'           => 'boolean',
    ];

    protected $hidden = ['access_token', 'refresh_token'];

    public function isExpired(): bool
    {
        return $this->token_expires_at->isPast();
    }
}
