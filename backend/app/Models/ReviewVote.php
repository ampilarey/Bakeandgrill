<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One customer finding one review helpful, once (iruali import plan, feature 6). */
class ReviewVote extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['review_id', 'customer_id'];
}
