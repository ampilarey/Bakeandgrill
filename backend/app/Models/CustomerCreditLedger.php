<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerCreditLedger extends Model
{
    protected $table = 'customer_credit_ledger';

    protected $casts = [
        'amount_laar' => 'integer',
        'balance_after_laar' => 'integer',
    ];

    protected $fillable = [
        'customer_id',
        'type',
        'amount_laar',
        'balance_after_laar',
        'order_id',
        'invoice_id',
        'payment_id',
        'shift_id',
        'method',
        'recorded_by',
        'notes',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
