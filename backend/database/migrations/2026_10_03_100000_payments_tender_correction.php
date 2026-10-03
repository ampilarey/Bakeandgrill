<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-10-03: "If a staff accidentally adds the wrong tender type,
 * for a QR payment he selected card, can the admin correct it?" It could
 * not: a payment's method was written once. A correction now changes the
 * method in place and keeps what it was, when, by whom and why.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->string('original_method', 40)->nullable()->after('method');
            $table->timestamp('tender_corrected_at')->nullable()->after('original_method');
            $table->unsignedBigInteger('tender_corrected_by')->nullable()->after('tender_corrected_at');
            $table->string('tender_correction_reason', 200)->nullable()->after('tender_corrected_by');
            $table->foreign('tender_corrected_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['tender_corrected_by']);
            $table->dropColumn(['original_method', 'tender_corrected_at', 'tender_corrected_by', 'tender_correction_reason']);
        });
    }
};
