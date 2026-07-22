<?php

declare(strict_types=1);

use App\Domains\Content\ContentRegistry;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ensure every existing content row is scope=shared, and mark registry-public
 * content keys is_public=true (fixes order-app divergence). Values unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('site_settings', 'scope')) {
            return;
        }

        DB::table('site_settings')
            ->where(function ($q): void {
                $q->whereNull('scope')->orWhere('scope', '');
            })
            ->update(['scope' => 'shared']);

        $publicKeys = ContentRegistry::publicKeys();
        if ($publicKeys === []) {
            return;
        }

        DB::table('site_settings')
            ->whereIn('key', $publicKeys)
            ->where('scope', 'shared')
            ->update(['is_public' => true]);
    }

    public function down(): void
    {
        // Intentionally empty — publicity backfill is additive and safe to keep.
    }
};
