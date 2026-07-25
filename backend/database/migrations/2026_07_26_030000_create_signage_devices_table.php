<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('signage_devices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('store_id')->nullable()->index();
            $table->foreignId('screen_id')->nullable()->constrained('signage_screens')->nullOnDelete();
            $table->string('device_id', 64)->unique();
            $table->string('pairing_code', 8)->nullable()->index();
            $table->boolean('approved')->default(false)->index();
            $table->timestamp('last_seen_at')->nullable()->index();
            $table->json('meta')->nullable();
            $table->json('queued_command')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('signage_devices');
    }
};
