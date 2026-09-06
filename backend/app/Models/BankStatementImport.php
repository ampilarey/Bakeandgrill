<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BankStatementImport extends Model
{
    protected $fillable = ['account', 'filename', 'imported_by', 'line_count', 'duplicate_count', 'credit_total_laar'];

    protected $casts = [
        'line_count' => 'integer',
        'duplicate_count' => 'integer',
        'credit_total_laar' => 'integer',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(BankStatementLine::class, 'import_id');
    }

    public function importer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'imported_by');
    }
}
