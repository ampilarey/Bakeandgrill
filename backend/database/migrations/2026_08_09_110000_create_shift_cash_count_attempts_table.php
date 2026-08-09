<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit trail for blind cash counts at shift close. Every review of a count
 * (POST /shifts/{id}/count-attempt) writes one row; the final close writes
 * one more marked is_accepted. This log is what makes it safe to let a
 * cashier recount after seeing the variance — the owner can see
 * "counted MVR 200 short, recounted, then it balanced".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shift_cash_count_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shift_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('attempt_number');
            $table->string('cash_count_method', 32);
            $table->decimal('counted_cash', 12, 2);
            $table->decimal('expected_cash', 12, 2);
            $table->decimal('variance', 12, 2);
            $table->json('breakdown')->nullable();
            $table->boolean('is_accepted')->default(false);
            $table->timestamp('created_at')->useCurrent();

            $table->index(['shift_id', 'attempt_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shift_cash_count_attempts');
    }
};
