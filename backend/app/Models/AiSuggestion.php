<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A change the assistant proposed, waiting for a person (App\Domains\Ai\AiSuggestions). */
class AiSuggestion extends Model
{
    protected $fillable = ['kind', 'subject_type', 'subject_id', 'subject_label', 'before', 'proposed', 'reason', 'status', 'subject_key', 'decided_by', 'decided_at'];

    protected $casts = ['before' => 'array', 'proposed' => 'array', 'decided_at' => 'datetime'];
}
