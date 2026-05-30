<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseRequestAttachment extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'purchase_request_id', 'purchase_request_item_id', 'uploaded_by',
        'type', 'file_path', 'original_filename', 'mime_type', 'size',
    ];

    protected $casts = [
        'size' => 'integer',
        'created_at' => 'datetime',
    ];

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequestItem::class, 'purchase_request_item_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
