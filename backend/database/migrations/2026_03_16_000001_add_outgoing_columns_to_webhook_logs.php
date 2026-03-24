<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The original webhook_logs table (2026_02_09_100400) was created for incoming
 * BML webhooks only. The later migration (2026_03_13_100000) tried to re-create
 * the table with outgoing-webhook columns but was silently skipped because the
 * table already existed. This migration adds the missing columns idempotently.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('webhook_logs', function (Blueprint $table): void {
            // direction: incoming (BML/external → us) or outgoing (us → subscriber)
            if (!Schema::hasColumn('webhook_logs', 'direction')) {
                $table->string('direction')->default('incoming')->after('id');
            }

            // FK to webhook_subscriptions — only set for outgoing logs
            if (!Schema::hasColumn('webhook_logs', 'webhook_subscription_id')) {
                $table->foreignId('webhook_subscription_id')
                    ->nullable()
                    ->after('direction')
                    ->constrained('webhook_subscriptions')
                    ->nullOnDelete();
            }

            // Target URL for outgoing webhooks
            if (!Schema::hasColumn('webhook_logs', 'url')) {
                $table->string('url')->nullable()->after('webhook_subscription_id');
            }

            // Canonical event name (e.g. order.created)
            if (!Schema::hasColumn('webhook_logs', 'event')) {
                $table->string('event')->nullable()->after('url');
            }

            // HTTP response code received from the subscriber endpoint
            if (!Schema::hasColumn('webhook_logs', 'response_code')) {
                $table->unsignedSmallInteger('response_code')->nullable()->after('error_message');
            }

            // Response body from the subscriber endpoint
            if (!Schema::hasColumn('webhook_logs', 'response_body')) {
                $table->text('response_body')->nullable()->after('response_code');
            }
        });

        // Add composite index for outgoing-log queries if it does not already exist
        if (!Schema::hasIndex('webhook_logs', 'webhook_logs_subscription_created_idx')) {
            Schema::table('webhook_logs', function (Blueprint $table): void {
                $table->index(['webhook_subscription_id', 'created_at'], 'webhook_logs_subscription_created_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::table('webhook_logs', function (Blueprint $table): void {
            // Drop the index first so column drops succeed
            try {
                $table->dropIndex('webhook_logs_subscription_created_idx');
            } catch (\Throwable) {
                // index may not exist — safe to ignore
            }

            if (Schema::hasColumn('webhook_logs', 'webhook_subscription_id')) {
                $table->dropConstrainedForeignId('webhook_subscription_id');
            }

            foreach (['direction', 'url', 'event', 'response_code', 'response_body'] as $col) {
                if (Schema::hasColumn('webhook_logs', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
