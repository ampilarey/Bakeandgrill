<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Service Availability — incident history & subscription binding.
 *
 * Append-only episode per unavailable window. Invariant enforced in service
 * logic: at most one row with status='open' per service_key.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_incidents', function (Blueprint $table) {
            $table->id();
            $table->string('service_key', 64)->index();
            $table->string('incident_type', 32);
            $table->string('status', 16)->default('open')->index();
            $table->string('public_message', 500)->nullable();
            $table->string('internal_note', 500)->nullable();
            $table->timestamp('started_at')->useCurrent()->index();
            $table->timestamp('scheduled_end_at')->nullable();
            $table->timestamp('restored_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('restored_by')->nullable();
            $table->unsignedInteger('notified_count')->default(0);
            $table->timestamps();

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('restored_by')->references('id')->on('users')->nullOnDelete();

            $table->index(['service_key', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_incidents');
    }
};
