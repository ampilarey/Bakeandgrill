<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Additive auto-apply mode for promotions (no code, all customers).
 * Existing rows keep auto_apply=false; code stays required for coded promos via validation.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('promotions')) {
            return;
        }

        Schema::table('promotions', function (Blueprint $table): void {
            if (!Schema::hasColumn('promotions', 'auto_apply')) {
                $table->boolean('auto_apply')->default(false)->after('is_active');
                $table->index('auto_apply');
            }
            if (!Schema::hasColumn('promotions', 'days_of_week')) {
                $table->json('days_of_week')->nullable()->after('expires_at');
            }
            if (!Schema::hasColumn('promotions', 'starts_time')) {
                $table->time('starts_time')->nullable()->after('days_of_week');
            }
            if (!Schema::hasColumn('promotions', 'ends_time')) {
                $table->time('ends_time')->nullable()->after('starts_time');
            }
        });

        // Make code nullable without doctrine/dbal. SQLite tests keep NOT NULL —
        // auto_apply rows use a unique AUTO-* sentinel in the model boot hook.
        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE promotions ALTER COLUMN code DROP NOT NULL');
        } elseif (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE promotions MODIFY code VARCHAR(255) NULL');
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('promotions')) {
            return;
        }

        Schema::table('promotions', function (Blueprint $table): void {
            if (Schema::hasColumn('promotions', 'ends_time')) {
                $table->dropColumn('ends_time');
            }
            if (Schema::hasColumn('promotions', 'starts_time')) {
                $table->dropColumn('starts_time');
            }
            if (Schema::hasColumn('promotions', 'days_of_week')) {
                $table->dropColumn('days_of_week');
            }
            if (Schema::hasColumn('promotions', 'auto_apply')) {
                $table->dropIndex(['auto_apply']);
                $table->dropColumn('auto_apply');
            }
        });
    }
};
