<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UnitConversion extends Model
{
    protected $fillable = ['from_unit', 'to_unit', 'factor'];
}
