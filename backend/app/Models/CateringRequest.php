<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class CateringRequest extends Model
{
    public const STATUSES = [
        'draft',
        'new',
        'contacted',
        'quoted',
        'awaiting_customer',
        'confirmed',
        'completed',
        'cancelled',
    ];

    public const OCCASIONS = [
        'office_breakfast',
        'event',
        'other',
    ];

    public const FULFILLMENT_METHODS = [
        'pickup',
        'delivery',
    ];

    protected $fillable = [
        'customer_id',
        'reference',
        'company',
        'occasion',
        'event_type',
        'contact_name',
        'phone',
        'email',
        'event_date',
        'fulfillment_method',
        'fulfillment_time',
        'setup_time',
        'venue_name',
        'delivery_address',
        'delivery_island',
        'onsite_contact_name',
        'onsite_contact_phone',
        'headcount',
        'notes',
        'dietary_notes',
        'fulfillment_options',
        'interested_items',
        'staff_notes',
        'quoted_amount',
        'pos_order_id',
        'handled_by',
        'contacted_at',
        'quoted_at',
        'confirmed_at',
        'status',
        'source',
    ];

    protected $casts = [
        'event_date' => 'date',
        'headcount' => 'integer',
        'interested_items' => 'array',
        'fulfillment_options' => 'array',
        'quoted_amount' => 'decimal:2',
        'contacted_at' => 'datetime',
        'quoted_at' => 'datetime',
        'confirmed_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(CateringRequestLine::class)->orderBy('sort_order')->orderBy('id');
    }

    public function posOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'pos_order_id');
    }

    public function handler(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by');
    }

    /**
     * Generate a unique EV-YYYYMMDD-XXXX reference.
     */
    public static function generateReference(?\DateTimeInterface $on = null): string
    {
        $date = ($on ?? now())->format('Ymd');
        for ($i = 0; $i < 12; $i++) {
            $candidate = 'EV-' . $date . '-' . strtoupper(Str::random(4));
            if (!static::query()->where('reference', $candidate)->exists()) {
                return $candidate;
            }
        }

        return 'EV-' . $date . '-' . strtoupper(Str::random(6));
    }
}
