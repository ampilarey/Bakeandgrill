<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bind each OTP to the purpose it was issued for. Without this, a
 * password-reset OTP could be consumed by the login/registration verify
 * endpoint (account takeover — 2026-08 payment/auth audit finding #1).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('otp_verifications', function (Blueprint $table) {
            if (!Schema::hasColumn('otp_verifications', 'purpose')) {
                $table->string('purpose', 32)->default('login')->after('email');
            }
        });
    }

    public function down(): void
    {
        Schema::table('otp_verifications', function (Blueprint $table) {
            if (Schema::hasColumn('otp_verifications', 'purpose')) {
                $table->dropColumn('purpose');
            }
        });
    }
};
