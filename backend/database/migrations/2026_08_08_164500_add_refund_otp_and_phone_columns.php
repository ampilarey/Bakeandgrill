<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Refund phone + customer OTP audit fields for two-step approval.
 * Historical rows keep null phone / no OTP data.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('refunds', function (Blueprint $table): void {
            $table->string('refund_phone', 32)->nullable()->after('no_customer_contact');
            $table->boolean('phone_added_at_refund')->default(false)->after('refund_phone');
            $table->string('otp_code_hash', 255)->nullable()->after('phone_added_at_refund');
            $table->timestamp('otp_expires_at')->nullable()->after('otp_code_hash');
            $table->unsignedTinyInteger('otp_attempts')->default(0)->after('otp_expires_at');
            $table->timestamp('otp_verified_at')->nullable()->after('otp_attempts');
            $table->boolean('otp_owner_override')->default(false)->after('otp_verified_at');
            $table->timestamp('otp_sent_at')->nullable()->after('otp_owner_override');
        });
    }

    public function down(): void
    {
        Schema::table('refunds', function (Blueprint $table): void {
            $table->dropColumn([
                'refund_phone',
                'phone_added_at_refund',
                'otp_code_hash',
                'otp_expires_at',
                'otp_attempts',
                'otp_verified_at',
                'otp_owner_override',
                'otp_sent_at',
            ]);
        });
    }
};
