<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Refund extends Model
{
    protected $fillable = [
        'order_id',
        'user_id',
        'customer_id',
        'initiated_by',
        'approved_by',
        'shift_id',
        'amount',
        'drawer_cash_out_laar',
        'status',
        'reason',
        'reason_category',
        'rejection_reason',
        'requested_at',
        'approved_at',
        'no_customer_contact',
        'refund_phone',
        'phone_added_at_refund',
        'otp_code_hash',
        'otp_expires_at',
        'otp_attempts',
        'otp_verified_at',
        'otp_owner_override',
        'otp_sent_at',
    ];

    protected $hidden = [
        'otp_code_hash',
    ];

    protected $casts = [
        'order_id' => 'integer',
        'user_id' => 'integer',
        'customer_id' => 'integer',
        'approved_by' => 'integer',
        'shift_id' => 'integer',
        'amount' => 'decimal:2',
        'drawer_cash_out_laar' => 'integer',
        'requested_at' => 'datetime',
        'approved_at' => 'datetime',
        'no_customer_contact' => 'boolean',
        'phone_added_at_refund' => 'boolean',
        'otp_expires_at' => 'datetime',
        'otp_attempts' => 'integer',
        'otp_verified_at' => 'datetime',
        'otp_owner_override' => 'boolean',
        'otp_sent_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** Customer who self-cancelled (null for staff-requested refunds). */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function isCustomerInitiated(): bool
    {
        return ($this->initiated_by ?? 'staff') === 'customer';
    }

    /** Requester (cashier who raised the refund). */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }
}
