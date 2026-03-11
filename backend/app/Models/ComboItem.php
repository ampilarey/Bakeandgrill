<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ComboItem extends Model
{
    protected $fillable = ['combo_id', 'item_id', 'quantity', 'is_optional'];

    protected $casts = ['quantity' => 'integer', 'is_optional' => 'boolean'];

    public function combo(): BelongsTo { return $this->belongsTo(Item::class, 'combo_id'); }
    public function item(): BelongsTo  { return $this->belongsTo(Item::class, 'item_id'); }
}
