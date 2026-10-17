<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PosterOrder extends Model
{
    /** Draft → proof approved (when that switch is on) → sent → quote approved → received → up → down. */
    public const STATES = ['draft', 'proof_approved', 'sent', 'quote_approved', 'received', 'up', 'down'];

    protected $fillable = [
        'poster_id', 'poster_export_id', 'supplier_id', 'state', 'quantities',
        'material', 'finish', 'gloss', 'white', 'mounting', 'imposition',
        'deadline', 'place', 'quote_mvr', 'quote_note', 'expense_id',
        'state_log', 'created_by',
    ];

    protected $casts = [
        'quantities' => 'array',
        'state_log' => 'array',
        'quote_mvr' => 'decimal:2',
        'deadline' => 'date',
    ];

    public function poster(): BelongsTo
    {
        return $this->belongsTo(Poster::class);
    }

    public function export(): BelongsTo
    {
        return $this->belongsTo(PosterExport::class, 'poster_export_id');
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function expense(): BelongsTo
    {
        return $this->belongsTo(Expense::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
