<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A customer's question about a dish (iruali import plan, feature 7). Waits
 * for staff; only answered ones show.
 */
class ItemQuestion extends Model
{
    public const PENDING = 'pending';

    public const ANSWERED = 'answered';

    public const HIDDEN = 'hidden';

    /** The words that put the standard allergy line under an answer. */
    private const ALLERGY_WORDS = [
        'allerg', 'nut', 'peanut', 'gluten', 'wheat', 'dairy', 'milk', 'lactose', 'egg', 'fish', 'shellfish',
        'prawn', 'shrimp', 'crab', 'soy', 'sesame', 'mustard', 'celery', 'sulphite', 'sulfite',
    ];

    protected $fillable = ['item_id', 'customer_id', 'question', 'answer', 'answered_by', 'answered_at', 'status'];

    protected $casts = ['answered_at' => 'datetime'];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** Does the question or answer touch on allergens? */
    public function mentionsAllergens(): bool
    {
        $text = mb_strtolower($this->question . ' ' . $this->answer);
        foreach (self::ALLERGY_WORDS as $word) {
            if (preg_match('/\b' . preg_quote($word, '/') . '/u', $text)) {
                return true;
            }
        }

        return false;
    }
}
