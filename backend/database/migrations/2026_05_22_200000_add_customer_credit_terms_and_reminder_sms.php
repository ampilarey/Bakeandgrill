<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->unsignedSmallInteger('credit_payment_terms_days')->default(30)->after('credit_notes');
            $table->boolean('credit_reminder_sms')->default(true)->after('credit_payment_terms_days');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->dropColumn(['credit_payment_terms_days', 'credit_reminder_sms']);
        });
    }
};
