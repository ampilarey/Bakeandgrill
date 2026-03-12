<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierRating extends Model
{
    protected $fillable = [
        'supplier_id', 'purchase_id', 'user_id',
        'quality_score', 'delivery_score', 'accuracy_score', 'price_score', 'notes',
    ];

    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function purchase(): BelongsTo { return $this->belongsTo(Purchase::class); }
    public function user(): BelongsTo     { return $this->belongsTo(User::class); }
}
