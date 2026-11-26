<?php

declare(strict_types=1);

use App\Domains\Labels\WrapConfig;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-11-26: "Dont keep barcode and any qr code nearby". A saved
 * wrap-around label whose QR strip stands beside its barcode strip has the
 * QR moved to another place (WrapConfig::codesApart), so a till's scanner
 * finds no QR code beside the bars.
 */
return new class extends Migration
{
    public function up(): void
    {
        $fix = function (string $table, string $column, ?string $inside): void {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, $column)) {
                return;
            }
            foreach (DB::table($table)->whereNotNull($column)->get(['id', $column]) as $row) {
                $data = is_string($row->{$column}) ? json_decode($row->{$column}, true) : null;
                $wrap = $inside === null ? $data : ($data[$inside] ?? null);
                if (!is_array($data) || !is_array($wrap) || !is_array($wrap['parts'] ?? null)) {
                    continue;
                }
                $moved = WrapConfig::codesApart($wrap['parts']);
                if ($moved === array_values($wrap['parts'])) {
                    continue;
                }
                $wrap['parts'] = $moved;
                if ($inside === null) {
                    $data = $wrap;
                } else {
                    $data[$inside] = $wrap;
                }
                DB::table($table)->where('id', $row->id)->update([$column => json_encode($data, JSON_UNESCAPED_UNICODE)]);
            }
        };
        $fix('custom_labels', 'label_wrap', null);
        $fix('items', 'label_wrap', null);
        $fix('label_templates', 'fields', 'label_wrap');
    }

    public function down(): void
    {
        // Nothing to undo: which labels were changed is not kept.
    }
};
