<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Every label sheet issued from the Label Hub: who, what, how many, which
 * dates and batch. Written when the print link is issued (the browser's print
 * dialog cannot report back); never edited or deleted from the app.
 *
 * Since 2026-10-12 each sticker print carries a short code: the sticker's
 * batch QR opens /b/{code}, the pack's public page (BatchLink), and the
 * expiring-stock watch (labels:check-expiring) marks a print once it has
 * told the owner about it.
 */
class LabelPrint extends Model
{
    public const UPDATED_AT = null;

    /** No 0/O or 1/I: a code is read off a sticker and typed. */
    public const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public const CODE_LENGTH = 8;

    protected $fillable = [
        'code', 'kind', 'layout', 'label_w_mm', 'label_h_mm', 'item_id', 'custom_label_id', 'kitchen_production_item_id',
        'trade_delivery_id', 'copies', 'mfg_date', 'exp_date', 'expiry_alerted_at', 'batch_code', 'pack_qty',
        'details', 'printed_by', 'output',
    ];

    protected $casts = [
        'details' => 'array',
        'mfg_date' => 'date',
        'exp_date' => 'date',
        'expiry_alerted_at' => 'datetime',
        'copies' => 'integer',
        'pack_qty' => 'integer',
    ];

    /** A code no other print has. */
    public static function newCode(): string
    {
        $alphabet = self::CODE_ALPHABET;
        do {
            $code = '';
            for ($i = 0; $i < self::CODE_LENGTH; $i++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
        } while (self::query()->where('code', $code)->exists());

        return $code;
    }

    /** Pack sticker prints (not box labels). */
    public function scopeStickers(Builder $query): Builder
    {
        return $query->where('kind', 'like', 'sticker_%');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function customLabel(): BelongsTo
    {
        return $this->belongsTo(CustomLabel::class);
    }

    public function printer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'printed_by');
    }

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(TradeDelivery::class, 'trade_delivery_id');
    }
}
