<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Supplier extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'contact_name',
        'phone',
        // Other numbers for the same shop. `phone` stays the main one — an
        // invoice is sent to it and the finance report shows it, and neither
        // should be picking between several (owner, 2026-09-08).
        'extra_phones',
        'email',
        'tin',
        'address',
        'payment_terms',
        // Where to send their money. An account number alone does not pay
        // anybody here: two banks issue them, and the name on the account is
        // often the shopkeeper's rather than the shop's (owner, 2026-09-08).
        'bank_name',
        'bank_account_name',
        'bank_account_number',
        // Stock audit 2026-09-03 (S6): days from order to delivery, per vendor.
        'lead_days',
        'notes',
        'is_active',
    ];

    protected $casts = [
        'extra_phones' => 'array',
    ];

    /**
     * Keep the extra numbers tidy however they arrived.
     *
     * Blank rows come from an "add another" box nobody filled in; a repeat of
     * the main number comes from somebody adding it twice, and a list showing
     * the same number twice reads as two ways to reach two people.
     */
    protected static function booted(): void
    {
        static::saving(function (self $supplier) {
            $extras = $supplier->extra_phones;
            if (!is_array($extras)) {
                $supplier->extra_phones = null;

                return;
            }

            $main = trim((string) $supplier->phone);
            $clean = [];
            foreach ($extras as $number) {
                $number = trim((string) $number);
                if ($number === '' || $number === $main || in_array($number, $clean, true)) {
                    continue;
                }
                $clean[] = $number;
            }

            $supplier->extra_phones = $clean === [] ? null : $clean;
        });
    }

    /** Every number for this shop, the main one first. */
    public function allPhones(): array
    {
        $main = trim((string) $this->phone);

        return array_values(array_filter(
            array_merge([$main], $this->extra_phones ?? []),
            fn ($n) => $n !== '',
        ));
    }

    public function purchases(): HasMany
    {
        return $this->hasMany(Purchase::class);
    }
}
