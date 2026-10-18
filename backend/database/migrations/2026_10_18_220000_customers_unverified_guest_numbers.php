<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Guest checkout numbers that were never checked with a code (owner, 2026-10-18).
 * A guest account is `phone_unverified` until its holder verifies from their own
 * session; when somebody else proves the number with a code, the guest account is set
 * aside (`unverified_phone` keeps what was typed) and the owner gets a clean one.
 * Every account made before this is treated as checked, as it always was.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->boolean('phone_unverified')->default(false)->index();
            $table->timestamp('phone_verified_at')->nullable();
            $table->string('unverified_phone', 30)->nullable()->index();
            $table->timestamp('set_aside_at')->nullable();
            $table->unsignedBigInteger('set_aside_for_customer_id')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['phone_unverified', 'phone_verified_at', 'unverified_phone', 'set_aside_at', 'set_aside_for_customer_id']);
        });
    }
};
