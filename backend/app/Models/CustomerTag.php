<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class CustomerTag extends Model
{
    protected $fillable = [
        'name',
        'color',
        'description',
    ];

    public function customers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'customer_tag_assignments')
            ->withTimestamps()
            ->withPivot(['assigned_by']);
    }
}
