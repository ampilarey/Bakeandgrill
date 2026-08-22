<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Signage playlists persist their element tree. The create-tables migration
 * seeded Default Board from SignageTemplateFactory, so every environment that
 * already ran that migration has `/order/view` baked into the QR slide.
 * Changing the factory only affects newly created templates.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('signage_playlists')) {
            $this->rewriteColumn('signage_playlists', 'slides');
        }
        if (Schema::hasTable('signage_campaigns')) {
            $this->rewriteColumn('signage_campaigns', 'slides');
        }
        if (Schema::hasTable('signage_screens')) {
            $this->rewriteColumn('signage_screens', 'fallback');
            $this->rewriteColumn('signage_screens', 'overrides');
        }
    }

    public function down(): void
    {
        // Printed QR codes now land on /menu. Reversing stored TV bindings
        // would send the screens back to a path that only exists as a 301.
    }

    private function rewriteColumn(string $table, string $column): void
    {
        $rows = DB::table($table)->select('id', $column)->get();
        foreach ($rows as $row) {
            $raw = $row->{$column};
            // json_encode escapes slashes, so do not string-match /order/view
            // on the raw column — decode first, then walk the tree.
            if (is_array($raw)) {
                $decoded = $raw;
            } elseif (is_string($raw) && $raw !== '') {
                $decoded = json_decode($raw, true);
            } else {
                continue;
            }
            if (!is_array($decoded)) {
                continue;
            }
            $rewritten = $this->rewriteValue($decoded);
            if ($rewritten === $decoded) {
                continue;
            }
            DB::table($table)->where('id', $row->id)->update([
                $column => json_encode($rewritten, JSON_UNESCAPED_UNICODE),
                'updated_at' => now(),
            ]);
        }
    }

    private function rewriteValue(mixed $value): mixed
    {
        if (is_string($value)) {
            return $this->rewriteUrl($value);
        }
        if (!is_array($value)) {
            return $value;
        }
        $out = [];
        foreach ($value as $key => $child) {
            $out[$key] = $this->rewriteValue($child);
        }

        return $out;
    }

    private function rewriteUrl(string $url): string
    {
        if ($url === '/order/view') {
            return '/menu';
        }
        if (str_ends_with($url, '/order/view')) {
            return substr($url, 0, -strlen('/order/view')) . '/menu';
        }

        return $url;
    }
};
