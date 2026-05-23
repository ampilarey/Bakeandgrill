<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('payments') && !$this->hasIndex('payments', 'payments_order_id_status_index')) {
            Schema::table('payments', function (Blueprint $table): void {
                $table->index(['order_id', 'status'], 'payments_order_id_status_index');
            });
        }

        if (Schema::hasTable('webhook_logs') && !$this->hasIndex('webhook_logs', 'webhook_logs_gateway_created_at_index')) {
            Schema::table('webhook_logs', function (Blueprint $table): void {
                $table->index(['gateway', 'created_at'], 'webhook_logs_gateway_created_at_index');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('payments')) {
            Schema::table('payments', function (Blueprint $table): void {
                $table->dropIndex('payments_order_id_status_index');
            });
        }

        if (Schema::hasTable('webhook_logs')) {
            Schema::table('webhook_logs', function (Blueprint $table): void {
                $table->dropIndex('webhook_logs_gateway_created_at_index');
            });
        }
    }

    private function hasIndex(string $table, string $indexName): bool
    {
        return Schema::hasIndex($table, $indexName);
    }
};
