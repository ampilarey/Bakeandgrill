<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerTagAssignment extends Model
{
    protected $fillable = [
        'customer_id',
        'customer_tag_id',
        'assigned_by',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function tag(): BelongsTo
    {
        return $this->belongsTo(CustomerTag::class, 'customer_tag_id');
    }

    public function assignedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }
}
