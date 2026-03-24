<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. audit_logs — composite index for fast model lookups
        if (Schema::hasTable('audit_logs')) {
            if (!Schema::hasIndex('audit_logs', 'audit_logs_model_type_model_id_index')) {
                Schema::table('audit_logs', function (Blueprint $table) {
                    $table->index(['model_type', 'model_id'], 'audit_logs_model_type_model_id_index');
                });
            }
        }

        // 2. customers.email — unique constraint (NULL values are excluded from uniqueness)
        if (Schema::hasTable('customers') && Schema::hasColumn('customers', 'email')) {
            if (!Schema::hasIndex('customers', 'customers_email_unique')) {
                Schema::table('customers', function (Blueprint $table) {
                    $table->string('email')->nullable()->unique()->change();
                });
            }
        }

        // 3. daily_specials — unique composite constraint to prevent duplicate specials
        if (Schema::hasTable('daily_specials')) {
            if (!Schema::hasIndex('daily_specials', 'daily_specials_item_date_unique')) {
                Schema::table('daily_specials', function (Blueprint $table) {
                    $table->unique(['item_id', 'start_date', 'end_date'], 'daily_specials_item_date_unique');
                });
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('audit_logs')) {
            Schema::table('audit_logs', function (Blueprint $table) {
                $table->dropIndex('audit_logs_model_type_model_id_index');
            });
        }

        if (Schema::hasTable('customers')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->dropUnique('customers_email_unique');
            });
        }

        if (Schema::hasTable('daily_specials')) {
            Schema::table('daily_specials', function (Blueprint $table) {
                $table->dropUnique('daily_specials_item_date_unique');
            });
        }
    }
};
