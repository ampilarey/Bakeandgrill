<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExpenseCategory extends Model
{
    protected $fillable = ['name', 'slug', 'icon', 'is_active', 'monthly_budget_laar'];

    protected $casts = [
        'is_active' => 'boolean',
        'monthly_budget_laar' => 'integer',
    ];

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }
}
