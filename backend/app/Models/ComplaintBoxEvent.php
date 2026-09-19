<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A status change, a note, or an SMS to the customer on a complaint box entry. */
class ComplaintBoxEvent extends Model
{
    public const TYPE_STATUS = 'status';

    public const TYPE_NOTE = 'note';

    public const TYPE_SMS = 'sms';

    protected $fillable = ['entry_id', 'type', 'from_status', 'to_status', 'message', 'sms_status', 'user_id'];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(ComplaintBoxEntry::class, 'entry_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
