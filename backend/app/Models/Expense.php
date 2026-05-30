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
        'expense_number', 'expense_category_id', 'supplier_id', 'supplier_tin',
        'supplier_invoice_no', 'supplier_invoice_date', 'user_id', 'purchase_id', 'payment_id',
        'description', 'amount_laar', 'amount', 'amount_excluding_gst_laar', 'tax_laar', 'tax_amount',
        'gst_rate_bp', 'is_tax_invoice_received', 'is_input_tax_claimable', 'claim_block_reason',
        'revenue_or_capital', 'taxable_activity_no',
        'payment_method', 'reference_number', 'expense_date', 'receipt_path',
        'is_recurring', 'recurrence_interval', 'next_recurrence_date',
        'status', 'approved_by', 'notes',
    ];

    protected $casts = [
        'expense_category_id' => 'integer',
        'supplier_id' => 'integer',
        'user_id' => 'integer',
        'approved_by' => 'integer',
        'purchase_id' => 'integer',
        'payment_id' => 'integer',
        'amount' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'amount_laar' => 'integer',
        'tax_laar' => 'integer',
        'amount_excluding_gst_laar' => 'integer',
        'gst_rate_bp' => 'integer',
        'is_tax_invoice_received' => 'boolean',
        'is_input_tax_claimable' => 'boolean',
        'is_recurring' => 'boolean',
        'expense_date' => 'date',
        'next_recurrence_date' => 'date',
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

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }
}
