<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A supplier's bill sent in to be read and checked (App\Domains\Inventory\Bills). */
class PurchaseBill extends Model
{
    public const QUEUED = 'queued';
    public const READING = 'reading';
    public const READY = 'ready';
    public const FAILED = 'failed';
    public const DONE = 'done';

    /** Still on the "Bills to check" list. */
    public const WAITING = [self::QUEUED, self::READING, self::READY, self::FAILED];

    protected $fillable = [
        'user_id', 'telegram_link_id', 'telegram_told_at', 'file_path', 'file_name', 'mime_type', 'file_hash',
        'status', 'reading_at', 'data', 'error', 'purchase_id',
    ];

    protected $hidden = ['file_path', 'file_hash'];

    protected $casts = [
        'data' => 'array',
        'reading_at' => 'datetime',
        'telegram_told_at' => 'datetime',
    ];
}
