<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('offline_sync_records', function (Blueprint $table): void {
            $table->id();
            $table->string('idempotency_key')->unique();
            $table->string('local_order_id', 64);
            $table->string('device_identifier', 64)->nullable();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('server_order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->string('status', 32); // synced, conflict, failed
            $table->string('payload_hash', 64);
            $table->boolean('inventory_conflict')->default(false);
            $table->text('last_error')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->index(['shift_id', 'status']);
            $table->index('local_order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('offline_sync_records');
    }
};
