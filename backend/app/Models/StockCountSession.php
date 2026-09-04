<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One stocktake, from opening the sheet to moving the stock.
 *
 * @see \App\Domains\Inventory\Services\StockCountSessionService for the rules.
 */
class StockCountSession extends Model
{
    use HasFactory;

    public const STATUS_OPEN = 'open';

    public const STATUS_SUBMITTED = 'submitted';

    public const STATUS_POSTED = 'posted';

    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'reference', 'status', 'inventory_category_id', 'note',
        'opened_by', 'opened_at', 'submitted_by', 'submitted_at',
        'posted_by', 'posted_at', 'cancelled_by', 'cancelled_at',
    ];

    protected $casts = [
        'opened_at' => 'datetime',
        'submitted_at' => 'datetime',
        'posted_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(StockCountLine::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(InventoryCategory::class, 'inventory_category_id');
    }

    public function opener(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function poster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    /** Still being worked on: lines can be written, nothing has moved. */
    public function isEditable(): bool
    {
        return $this->status === self::STATUS_OPEN;
    }

    public function isTerminal(): bool
    {
        return in_array($this->status, [self::STATUS_POSTED, self::STATUS_CANCELLED], true);
    }
}
