<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            $table->string('cash_count_method', 32)->nullable()->after('variance');
            $table->json('cash_count_breakdown')->nullable()->after('cash_count_method');
            $table->json('foreign_currency_held')->nullable()->after('cash_count_breakdown');
        });
    }

    public function down(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            $table->dropColumn(['cash_count_method', 'cash_count_breakdown', 'foreign_currency_held']);
        });
    }
};
