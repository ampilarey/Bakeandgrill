<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_drivers', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('phone', 30)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('orders', function (Blueprint $table): void {
            $table->foreignId('delivery_driver_id')
                ->nullable()
                ->after('delivery_eta_at')
                ->constrained('delivery_drivers')
                ->nullOnDelete();
            $table->timestamp('driver_assigned_at')->nullable()->after('delivery_driver_id');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropForeign(['delivery_driver_id']);
            $table->dropColumn(['delivery_driver_id', 'driver_assigned_at']);
        });

        Schema::dropIfExists('delivery_drivers');
    }
};
