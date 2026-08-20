<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Second factor for staff accounts.
 *
 * All three columns are nullable and default to null, so this migration
 * enables nothing on its own — every existing account signs in exactly as it
 * did before until someone enrols. That matters: this runs against a live
 * venue, and a migration that switched 2FA on would lock the owner out of
 * their own admin panel at whatever hour it deployed.
 *
 * The secret and the recovery codes are held under Laravel's encrypted casts,
 * so a leaked database dump does not hand over the second factor alongside the
 * first. Recovery codes are additionally hashed before encryption — see
 * TwoFactorService.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // TEXT, not string: the ciphertext of a 32-character base32 secret
            // is a few hundred bytes, and the recovery-code payload is longer.
            $table->text('two_factor_secret')->nullable()->after('password');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_secret');
            // The enrolment is only real once a code from the phone has been
            // proved. A secret with no confirmation is an abandoned setup.
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_recovery_codes');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'two_factor_secret',
                'two_factor_recovery_codes',
                'two_factor_confirmed_at',
            ]);
        });
    }
};
