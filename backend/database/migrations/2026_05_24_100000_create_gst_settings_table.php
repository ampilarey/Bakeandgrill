<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gst_settings', function (Blueprint $table) {
            $table->id();
            $table->boolean('gst_registered')->default(false);
            $table->string('seller_name')->nullable();
            $table->text('seller_address')->nullable();
            $table->string('seller_tin', 30)->nullable();
            $table->string('taxable_activity_no', 30)->nullable();
            $table->string('sector', 20)->default('general');
            $table->unsignedSmallInteger('default_tax_rate_bp')->default(800);
            $table->boolean('tax_inclusive')->default(false);
            $table->string('taxable_period', 20)->default('monthly');
            $table->string('accounting_basis', 20)->default('hybrid');
            $table->string('currency', 3)->default('MVR');
            $table->string('invoice_prefix', 20)->default('BG-TI');
            $table->string('credit_note_prefix', 20)->default('BG-CN');
            $table->string('invoice_sequence_mode', 20)->default('yearly');
            $table->unsignedInteger('next_invoice_sequence')->default(1);
            $table->unsignedInteger('next_credit_note_sequence')->default(1);
            $table->boolean('lock_after_export')->default(false);
            $table->timestamps();
        });

        $taxInclusive = filter_var(env('TAX_INCLUSIVE', false), FILTER_VALIDATE_BOOLEAN);
        $taxRateBp = (int) env('TAX_RATE_BP', 800);

        DB::table('gst_settings')->insert([
            'gst_registered' => false,
            'sector' => 'general',
            'default_tax_rate_bp' => $taxRateBp > 0 ? $taxRateBp : 800,
            'tax_inclusive' => $taxInclusive,
            'taxable_period' => 'monthly',
            'accounting_basis' => 'hybrid',
            'currency' => 'MVR',
            'invoice_prefix' => 'BG-TI',
            'credit_note_prefix' => 'BG-CN',
            'invoice_sequence_mode' => 'yearly',
            'next_invoice_sequence' => 1,
            'next_credit_note_sequence' => 1,
            'lock_after_export' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('gst_settings');
    }
};
