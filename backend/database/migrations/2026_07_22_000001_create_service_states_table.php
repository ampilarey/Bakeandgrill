<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Service Availability & Maintenance — enforcement SSOT.
 *
 * One row per service_key (e.g. online_checkout, online_delivery,
 * customer_registration, marketing_site, pos_sales, emergency_write_lock).
 *
 * The ServiceStateSeeder seeds every key with status=available so this
 * migration must NEVER block live traffic on its own.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_states', function (Blueprint $table) {
            $table->id();
            $table->string('service_key', 64)->unique();
            $table->string('group', 32)->default('public')->index();
            $table->string('status', 32)->default('available')->index();
            $table->string('reason_type', 32)->nullable();
            $table->string('public_message', 500)->nullable();
            $table->string('internal_note', 500)->nullable();
            $table->json('alternatives')->nullable();
            $table->boolean('allow_existing_operations')->default(true);
            $table->boolean('allow_admin_bypass')->default(true);
            $table->timestamp('starts_at')->nullable()->index();
            $table->timestamp('ends_at')->nullable()->index();
            $table->unsignedBigInteger('current_incident_id')->nullable()->index();
            $table->boolean('notify_enabled')->default(true);
            $table->unsignedBigInteger('changed_by')->nullable();
            $table->timestamps();

            $table->foreign('changed_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_states');
    }
};
