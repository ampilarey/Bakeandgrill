<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KitchenProductionAttachment extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'kitchen_production_batch_id', 'kitchen_production_item_id', 'kitchen_receiving_item_id',
        'uploaded_by', 'type', 'file_path', 'original_filename', 'mime_type', 'size',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function batch(): BelongsTo
    {
        return $this->belongsTo(KitchenProductionBatch::class, 'kitchen_production_batch_id');
    }
}
