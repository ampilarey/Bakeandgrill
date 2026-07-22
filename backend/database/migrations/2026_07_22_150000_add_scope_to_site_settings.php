<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage 1: add scope column (default shared), then swap unique key → (key, scope).
 * Guarded against (key, scope) collisions before creating the composite unique.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('site_settings', function (Blueprint $table): void {
            if (!Schema::hasColumn('site_settings', 'scope')) {
                $table->string('scope', 16)->default('shared')->after('key');
                $table->index('scope');
            }
        });

        // Backfill any null/empty scopes (defensive for partial deploys).
        DB::table('site_settings')
            ->whereNull('scope')
            ->orWhere('scope', '')
            ->update(['scope' => 'shared']);

        // Drop legacy unique on key (name varies by driver).
        $this->dropKeyUnique();

        // Collapse accidental duplicate (key, scope) rows — keep lowest id.
        $dupes = DB::table('site_settings')
            ->select('key', 'scope', DB::raw('MIN(id) as keep_id'), DB::raw('COUNT(*) as c'))
            ->groupBy('key', 'scope')
            ->having('c', '>', 1)
            ->get();
        foreach ($dupes as $d) {
            DB::table('site_settings')
                ->where('key', $d->key)
                ->where('scope', $d->scope)
                ->where('id', '!=', $d->keep_id)
                ->delete();
        }

        Schema::table('site_settings', function (Blueprint $table): void {
            $table->unique(['key', 'scope'], 'site_settings_key_scope_unique');
        });
    }

    public function down(): void
    {
        Schema::table('site_settings', function (Blueprint $table): void {
            $table->dropUnique('site_settings_key_scope_unique');
        });

        // Keep only shared rows when reverting so key can be unique again.
        DB::table('site_settings')->where('scope', '!=', 'shared')->delete();

        Schema::table('site_settings', function (Blueprint $table): void {
            $table->unique('key');
            if (Schema::hasColumn('site_settings', 'scope')) {
                $table->dropIndex(['scope']);
                $table->dropColumn('scope');
            }
        });
    }

    private function dropKeyUnique(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'sqlite') {
            try {
                Schema::table('site_settings', function (Blueprint $table): void {
                    $table->dropUnique(['key']);
                });
            } catch (Throwable) {
                // Index may already be gone or named differently.
            }

            return;
        }

        try {
            Schema::table('site_settings', function (Blueprint $table): void {
                $table->dropUnique(['key']);
            });
        } catch (Throwable) {
            try {
                DB::statement('ALTER TABLE site_settings DROP INDEX site_settings_key_unique');
            } catch (Throwable) {
                try {
                    DB::statement('ALTER TABLE site_settings DROP CONSTRAINT site_settings_key_unique');
                } catch (Throwable) {
                    // Already dropped.
                }
            }
        }
    }
};
