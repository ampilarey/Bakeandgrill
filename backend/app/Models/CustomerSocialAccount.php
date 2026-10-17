<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A customer's Google, Facebook or Apple sign-in (App\Domains\Auth\Services\SocialLoginService). */
class CustomerSocialAccount extends Model
{
    protected $fillable = ['customer_id', 'provider', 'subject', 'email', 'last_used_at'];

    protected $casts = ['last_used_at' => 'datetime'];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
