<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_contacts', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('phone', 20);
            $table->enum('type', ['staff', 'external'])->default('external');
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('is_enabled')->default(true);
            $table->json('tags')->nullable();
            $table->json('active_days')->nullable();
            $table->time('active_from')->nullable();
            $table->time('active_until')->nullable();
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->index('type');
            $table->index('is_enabled');
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_contacts');
    }
};
