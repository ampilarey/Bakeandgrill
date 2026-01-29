<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseReceipt extends Model
{
    protected $fillable = [
        'purchase_id',
        'user_id',
        'file_path',
        'file_name',
        'mime_type',
    ];
}
