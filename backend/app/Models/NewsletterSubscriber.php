<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One address on the newsletter list (iruali import plan, feature 4). */
class NewsletterSubscriber extends Model
{
    protected $fillable = ['email', 'locale', 'token', 'confirmed_at', 'unsubscribed_at', 'source', 'customer_id'];

    protected $casts = ['confirmed_at' => 'datetime', 'unsubscribed_at' => 'datetime'];

    protected $hidden = ['token'];
}
