<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BankStatementLine extends Model
{
    public const MATCH_AUTO = 'auto';

    public const MATCH_MANUAL = 'manual';

    public const MATCH_UNMATCHED = 'unmatched';

    public const MATCH_IGNORED = 'ignored';

    public const KIND_POS = 'pos';

    public const KIND_TRANSFER = 'transfer';

    public const KIND_OTHER = 'other';

    protected $fillable = [
        'import_id', 'account', 'txn_date', 'for_date', 'kind', 'description', 'reference', 'counterparty',
        'amount_laar', 'balance_laar', 'fingerprint', 'matched_payment_id', 'match_status',
    ];

    protected $casts = [
        'txn_date' => 'date',
        'for_date' => 'date',
        'amount_laar' => 'integer',
        'balance_laar' => 'integer',
        'matched_payment_id' => 'integer',
    ];

    public function import(): BelongsTo
    {
        return $this->belongsTo(BankStatementImport::class, 'import_id');
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class, 'matched_payment_id');
    }
}
