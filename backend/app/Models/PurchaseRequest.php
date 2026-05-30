<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseRequest extends Model
{
    public const STATUSES = [
        'requested', 'approved', 'assigned', 'buying', 'partially_bought',
        'bought_pending_verification', 'received', 'closed', 'rejected', 'cancelled',
    ];

    public const TERMINAL_STATUSES = ['closed', 'rejected', 'cancelled'];

    public const OPEN_STATUSES = [
        'requested', 'approved', 'assigned', 'buying', 'partially_bought', 'bought_pending_verification', 'received',
    ];

    protected $fillable = [
        'request_no', 'title', 'source', 'status', 'priority', 'needed_by',
        'requested_by', 'approved_by', 'assigned_to', 'verified_by', 'rejected_by',
        'rejection_reason', 'notes', 'total_estimated_laar', 'total_actual_laar',
        'purchase_id', 'expense_id', 'merged_into_id',
    ];

    protected $casts = [
        'needed_by' => 'datetime',
        'total_estimated_laar' => 'integer',
        'total_actual_laar' => 'integer',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseRequestItem::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(PurchaseRequestAttachment::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function rejector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    public function expense(): BelongsTo
    {
        return $this->belongsTo(Expense::class);
    }

    public function mergedInto(): BelongsTo
    {
        return $this->belongsTo(self::class, 'merged_into_id');
    }

    public function isMutableForBuying(): bool
    {
        return in_array($this->status, ['assigned', 'buying', 'partially_bought'], true);
    }

    public function isTerminal(): bool
    {
        return in_array($this->status, self::TERMINAL_STATUSES, true);
    }
}
