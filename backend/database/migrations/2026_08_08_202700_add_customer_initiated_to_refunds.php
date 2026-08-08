<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Distinguish customer self-cancel refunds from staff two-person refunds.
 * Staff rows stay initiated_by=staff; customer path sets customer + customer_id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('refunds', function (Blueprint $table): void {
            $table->string('initiated_by', 16)->default('staff')->after('user_id');
            $table->foreignId('customer_id')->nullable()->after('initiated_by')
                ->constrained('customers')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('refunds', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('customer_id');
            $table->dropColumn('initiated_by');
        });
    }
};
