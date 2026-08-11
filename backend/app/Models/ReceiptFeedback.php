<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceiptFeedback extends Model
{
    protected $table = 'receipt_feedback';

    protected $fillable = [
        'receipt_id',
        'rating',
        'comments',
        'submitted_at',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
    ];

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(Receipt::class);
    }

    /**
     * One rating per receipt: create or update the existing row.
     */
    public static function upsertForReceipt(Receipt $receipt, int $rating, ?string $comments = null): self
    {
        $existing = self::query()->where('receipt_id', $receipt->id)->first();
        if ($existing) {
            $existing->rating = $rating;
            $existing->comments = $comments;
            $existing->submitted_at = now();
            $existing->save();

            return $existing;
        }

        return self::create([
            'receipt_id' => $receipt->id,
            'rating' => $rating,
            'comments' => $comments,
            'submitted_at' => now(),
        ]);
    }
}
