<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Service Availability — one-time restoration SMS subscription.
 *
 * Bound to (service_incident_id, normalized_mobile) so numbers do not roll
 * across incidents and are never merged into customers/marketing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('restoration_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->string('service_key', 64)->index();
            $table->unsignedBigInteger('service_incident_id')->nullable()->index();
            $table->string('normalized_mobile', 20);
            $table->string('status', 16)->default('pending')->index();
            $table->string('consent_text_version', 16);
            $table->timestamp('requested_at')->useCurrent();
            $table->timestamp('notified_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->unsignedBigInteger('sms_log_id')->nullable();
            $table->string('request_ip_hash', 64)->nullable();
            $table->timestamps();

            $table->foreign('service_incident_id')->references('id')->on('service_incidents')->nullOnDelete();

            $table->unique(['service_incident_id', 'normalized_mobile'], 'restoration_sub_incident_mobile_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('restoration_subscriptions');
    }
};
