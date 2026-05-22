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
            $table->boolean('credit_enabled')->default(false)->after('internal_notes');
            $table->foreignId('credit_approved_by')->nullable()->after('credit_enabled')->constrained('users')->nullOnDelete();
            $table->timestamp('credit_approved_at')->nullable()->after('credit_approved_by');
            $table->unsignedBigInteger('credit_limit_laar')->default(0)->after('credit_approved_at');
            $table->unsignedBigInteger('credit_balance_laar')->default(0)->after('credit_limit_laar');
            $table->enum('credit_status', ['active', 'on_hold', 'blocked'])->default('blocked')->after('credit_balance_laar');
            $table->text('credit_notes')->nullable()->after('credit_status');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->dropForeign(['credit_approved_by']);
            $table->dropColumn([
                'credit_enabled',
                'credit_approved_by',
                'credit_approved_at',
                'credit_limit_laar',
                'credit_balance_laar',
                'credit_status',
                'credit_notes',
            ]);
        });
    }
};
