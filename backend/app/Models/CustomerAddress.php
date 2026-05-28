<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerAddress extends Model
{
    protected $fillable = [
        'customer_id',
        'label',
        'address_line1',
        'address_line2',
        'island',
        'contact_name',
        'contact_phone',
        'notes',
        'location_link',
        'is_default',
    ];

    protected $casts = [
        'is_default' => 'boolean',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return array<string, mixed> */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'address_line1' => $this->address_line1,
            'address_line2' => $this->address_line2,
            'island' => $this->island,
            'contact_name' => $this->contact_name,
            'contact_phone' => $this->contact_phone,
            'notes' => $this->notes,
            'location_link' => $this->location_link,
            'is_default' => $this->is_default,
        ];
    }
}
