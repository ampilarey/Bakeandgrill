<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ComplaintContactLog extends Model
{
    public const CHANNELS = ['phone', 'whatsapp', 'in_person'];

    protected $fillable = [
        'complaint_id',
        'channel',
        'note',
        'logged_by_user_id',
    ];

    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }

    public function loggedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'logged_by_user_id');
    }
}
