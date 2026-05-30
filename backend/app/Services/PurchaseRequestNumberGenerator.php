<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\PurchaseRequest;
use Illuminate\Support\Facades\DB;

final class PurchaseRequestNumberGenerator
{
    public static function next(): string
    {
        return DB::transaction(function () {
            $prefix = 'PR-' . now()->format('Ymd') . '-';
            $last = PurchaseRequest::where('request_no', 'like', $prefix . '%')
                ->lockForUpdate()
                ->orderByDesc('request_no')
                ->value('request_no');

            $seq = 1;
            if ($last && preg_match('/-(\d{4})$/', $last, $m)) {
                $seq = (int) $m[1] + 1;
            }

            return $prefix . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
        });
    }
}
