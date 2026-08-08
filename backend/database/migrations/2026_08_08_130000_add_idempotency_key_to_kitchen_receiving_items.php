<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Request-level idempotency for kitchen receive retries vs new partial receipts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kitchen_receiving_items', function (Blueprint $table): void {
            if (!Schema::hasColumn('kitchen_receiving_items', 'idempotency_key')) {
                $table->string('idempotency_key', 128)->nullable()->unique()->after('notes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('kitchen_receiving_items', function (Blueprint $table): void {
            if (Schema::hasColumn('kitchen_receiving_items', 'idempotency_key')) {
                $table->dropUnique(['idempotency_key']);
                $table->dropColumn('idempotency_key');
            }
        });
    }
};
