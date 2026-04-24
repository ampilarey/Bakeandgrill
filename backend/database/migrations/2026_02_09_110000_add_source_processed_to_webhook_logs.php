<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the `source` and `processed` columns to webhook_logs that were listed
 * in the model's $fillable but never added by any prior migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('webhook_logs', function (Blueprint $table): void {
            if (!Schema::hasColumn('webhook_logs', 'source')) {
                $table->string('source')->nullable()->after('status');
            }

            if (!Schema::hasColumn('webhook_logs', 'processed')) {
                $table->boolean('processed')->default(false)->after('processed_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('webhook_logs', function (Blueprint $table): void {
            foreach (['source', 'processed'] as $col) {
                if (Schema::hasColumn('webhook_logs', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
