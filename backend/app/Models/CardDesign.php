<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A saved printed-card design (App\Domains\Cards\CardSpec). */
class CardDesign extends Model
{
    protected $fillable = ['name', 'settings', 'created_by'];

    protected $casts = ['settings' => 'array'];
}
