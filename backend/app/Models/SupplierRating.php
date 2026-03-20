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

    protected $casts = [
        'supplier_id'     => 'integer',
        'purchase_id'     => 'integer',
        'user_id'         => 'integer',
        'quality_score'   => 'integer',
        'delivery_score'  => 'integer',
        'accuracy_score'  => 'integer',
        'price_score'     => 'integer',
    ];

    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function purchase(): BelongsTo { return $this->belongsTo(Purchase::class); }
    public function user(): BelongsTo     { return $this->belongsTo(User::class); }
}
