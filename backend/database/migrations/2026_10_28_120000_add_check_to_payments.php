<?php

declare(strict_types=1);

use App\Support\BusinessDay;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-10-28: a QR customer types the amount themselves and the card
 * machine takes what the cashier keys in, so each QR and card payment is
 * ticked against MPOS or the card slip in Admin (App\Domains\Finance\Support\PaymentChecks).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->string('check_status', 12)->nullable()->index();
            $table->integer('checked_amount_laar')->nullable();
            $table->string('check_reference', 40)->nullable();
            $table->string('check_note', 200)->nullable();
            $table->unsignedBigInteger('checked_by')->nullable();
            $table->timestamp('checked_at')->nullable();
        });

        // Payments before today were never checked and are not asked about.
        DB::table('site_settings')->updateOrInsert(
            ['key' => 'payment_check_start_date'],
            [
                'value' => BusinessDay::todayYmd(),
                'type' => 'text',
                'group' => 'Finance',
                'label' => 'Check QR and card payments from',
                'description' => 'QR and card payments from this day on are listed as not checked until ticked against MPOS or the card slip.',
                'is_public' => false,
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['check_status']);
            $table->dropColumn(['check_status', 'checked_amount_laar', 'check_reference', 'check_note', 'checked_by', 'checked_at']);
        });
        DB::table('site_settings')->where('key', 'payment_check_start_date')->delete();
    }
};
