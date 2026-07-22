<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RecurringShoppingList extends Model
{
    protected $fillable = [
        'name', 'is_active', 'recurrence_interval', 'next_run_date', 'priority', 'title_template',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'next_run_date' => 'date',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(RecurringShoppingListItem::class)->orderBy('sort')->orderBy('id');
    }
}
