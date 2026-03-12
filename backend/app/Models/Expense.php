<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Expense extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'expense_number', 'expense_category_id', 'supplier_id', 'user_id', 'purchase_id',
        'description', 'amount_laar', 'amount', 'tax_laar', 'tax_amount',
        'payment_method', 'reference_number', 'expense_date', 'receipt_path',
        'is_recurring', 'recurrence_interval', 'next_recurrence_date',
        'status', 'approved_by', 'notes',
    ];

    protected $casts = [
        'expense_date'         => 'date',
        'next_recurrence_date' => 'date',
        'is_recurring'         => 'boolean',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(ExpenseCategory::class, 'expense_category_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }
}
