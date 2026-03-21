<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table): void {
            $table->string('token', 64)->nullable()->unique()->after('invoice_number');
        });

        // Back-fill tokens for existing invoices
        DB::table('invoices')->whereNull('token')->orderBy('id')->each(function (object $invoice): void {
            DB::table('invoices')
                ->where('id', $invoice->id)
                ->update(['token' => Str::random(48)]);
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table): void {
            $table->dropColumn('token');
        });
    }
};
