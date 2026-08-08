<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit trail for reclaimable webhook deliveries (failed → retry).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('webhook_logs', function (Blueprint $table): void {
            if (!Schema::hasColumn('webhook_logs', 'attempt_count')) {
                $table->unsignedInteger('attempt_count')->default(1)->after('status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('webhook_logs', function (Blueprint $table): void {
            if (Schema::hasColumn('webhook_logs', 'attempt_count')) {
                $table->dropColumn('attempt_count');
            }
        });
    }
};
