<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Add locale to site_settings (default en) and widen unique to (key, scope, locale).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('site_settings', function (Blueprint $table): void {
            if (!Schema::hasColumn('site_settings', 'locale')) {
                $table->string('locale', 8)->default('en')->after('scope');
                $table->index('locale');
            }
        });

        DB::table('site_settings')
            ->whereNull('locale')
            ->orWhere('locale', '')
            ->update(['locale' => 'en']);

        $this->dropKeyScopeUnique();

        $dupes = DB::table('site_settings')
            ->select('key', 'scope', 'locale', DB::raw('MIN(id) as keep_id'), DB::raw('COUNT(*) as c'))
            ->groupBy('key', 'scope', 'locale')
            ->having('c', '>', 1)
            ->get();
        foreach ($dupes as $d) {
            DB::table('site_settings')
                ->where('key', $d->key)
                ->where('scope', $d->scope)
                ->where('locale', $d->locale)
                ->where('id', '!=', $d->keep_id)
                ->delete();
        }

        Schema::table('site_settings', function (Blueprint $table): void {
            $table->unique(['key', 'scope', 'locale'], 'site_settings_key_scope_locale_unique');
        });
    }

    public function down(): void
    {
        Schema::table('site_settings', function (Blueprint $table): void {
            $table->dropUnique('site_settings_key_scope_locale_unique');
        });

        // Keep only English rows when reverting.
        DB::table('site_settings')->where('locale', '!=', 'en')->delete();

        Schema::table('site_settings', function (Blueprint $table): void {
            $table->unique(['key', 'scope'], 'site_settings_key_scope_unique');
            if (Schema::hasColumn('site_settings', 'locale')) {
                $table->dropIndex(['locale']);
                $table->dropColumn('locale');
            }
        });
    }

    private function dropKeyScopeUnique(): void
    {
        try {
            Schema::table('site_settings', function (Blueprint $table): void {
                $table->dropUnique('site_settings_key_scope_unique');
            });
        } catch (Throwable) {
            try {
                Schema::table('site_settings', function (Blueprint $table): void {
                    $table->dropUnique(['key', 'scope']);
                });
            } catch (Throwable) {
                // Already dropped.
            }
        }
    }
};
