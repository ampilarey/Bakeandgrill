<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One message about an order, from the customer or from staff (iruali import plan, feature 9). */
class OrderMessage extends Model
{
    public const CUSTOMER = 'customer';

    public const STAFF = 'staff';

    protected $fillable = ['order_id', 'sender', 'user_id', 'body', 'photo_path', 'read_at', 'complaint_id'];

    protected $casts = ['read_at' => 'datetime'];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
