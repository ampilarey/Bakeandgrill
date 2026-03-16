<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReservationSetting extends Model
{
    protected $fillable = [
        'slot_duration_minutes',
        'max_party_size',
        'advance_booking_days',
        'buffer_minutes_between',
        'auto_cancel_minutes',
        'opening_time',
        'closing_time',
    ];

    protected $casts = [
        'slot_duration_minutes'  => 'integer',
        'max_party_size'         => 'integer',
        'advance_booking_days'   => 'integer',
        'buffer_minutes_between' => 'integer',
        'auto_cancel_minutes'    => 'integer',
    ];

    public static function current(): self
    {
        return self::firstOrCreate([], [
            'slot_duration_minutes'  => 60,
            'max_party_size'         => 10,
            'advance_booking_days'   => 30,
            'buffer_minutes_between' => 15,
            'auto_cancel_minutes'    => 15,
            'opening_time'           => '09:00',
            'closing_time'           => '22:00',
        ]);
    }
}
