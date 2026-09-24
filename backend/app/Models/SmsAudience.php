<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A saved campaign audience: a name over targeting criteria
 * (see SmsAudienceCriteria).
 */
class SmsAudience extends Model
{
    protected $fillable = ['name', 'description', 'criteria', 'created_by'];

    protected $casts = ['criteria' => 'array'];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
