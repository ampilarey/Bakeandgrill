<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\KitchenProductionBatch;
use Illuminate\Support\Facades\DB;

final class KitchenProductionBatchNumberGenerator
{
    public static function next(): string
    {
        return DB::transaction(function () {
            $prefix = 'KP-' . now()->format('Ymd') . '-';
            $last = KitchenProductionBatch::where('batch_no', 'like', $prefix . '%')
                ->lockForUpdate()
                ->orderByDesc('batch_no')
                ->value('batch_no');

            $seq = 1;
            if ($last && preg_match('/-(\d{4})$/', $last, $m)) {
                $seq = (int) $m[1] + 1;
            }

            return $prefix . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
        });
    }
}
