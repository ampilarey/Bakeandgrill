<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One print run of cards: which design, which codes' source, how many. */
class CardPrint extends Model
{
    protected $fillable = ['card_design_id', 'source', 'source_id', 'cards', 'output', 'sides', 'note', 'user_id'];

    protected $casts = ['cards' => 'integer', 'source_id' => 'integer'];

    public function design(): BelongsTo
    {
        return $this->belongsTo(CardDesign::class, 'card_design_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
