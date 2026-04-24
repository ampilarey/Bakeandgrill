<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('xero_connections')) {
            Schema::create('xero_connections', function (Blueprint $table) {
                $table->id();
                $table->string('tenant_id')->unique();
                $table->string('tenant_name');
                $table->text('access_token');
                $table->text('refresh_token');
                $table->timestamp('token_expires_at')->nullable();
                $table->timestamp('connected_at')->nullable();
                $table->boolean('active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('xero_sync_logs')) {
            Schema::create('xero_sync_logs', function (Blueprint $table) {
                $table->id();
                $table->string('resource_type'); // invoice, expense, payment
                $table->unsignedBigInteger('resource_id');
                $table->string('xero_id')->nullable();
                $table->string('direction')->default('push'); // push | pull
                $table->string('status')->default('success'); // success | failed
                $table->text('error')->nullable();
                $table->timestamps();

                $table->index(['resource_type', 'resource_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('xero_sync_logs');
        Schema::dropIfExists('xero_connections');
    }
};
