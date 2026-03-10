<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reservations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('customer_name');
            $table->string('customer_phone', 20);
            $table->unsignedTinyInteger('party_size');
            $table->date('date');
            $table->time('time_slot');
            $table->unsignedSmallInteger('duration_minutes')->default(60);
            $table->foreignId('table_id')->nullable()->constrained('restaurant_tables')->nullOnDelete();
            $table->enum('status', ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'])
                  ->default('pending');
            $table->text('notes')->nullable();
            $table->string('tracking_token', 64)->unique()->nullable();
            $table->timestamps();

            $table->index(['date', 'status']);
            $table->index(['customer_id', 'status']);
            $table->index('tracking_token');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reservations');
    }
};
