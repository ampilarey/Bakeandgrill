<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CorporateInquiry extends Model
{
    protected $fillable = [
        'company',
        'contact_name',
        'phone',
        'email',
        'event_date',
        'headcount',
        'notes',
        'status',
    ];

    protected $casts = [
        'event_date' => 'date',
        'headcount' => 'integer',
    ];
}
