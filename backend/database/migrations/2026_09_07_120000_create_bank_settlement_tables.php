<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bank settlement ledger (owner, 2026-09-07): "the system must match actual
 * money received."
 *
 * Card and QR takings land in one account a day or more later, sometimes in
 * parts; transfers land in another account line by line; cash is handed to
 * the owner. Statement lines are imported and applied to the oldest
 * unsettled day first, so nobody has to guess which day a deposit was for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_statement_imports', function (Blueprint $table): void {
            $table->id();
            // 'card_qr' | 'transfer'
            $table->string('account', 16)->index();
            $table->string('filename', 255);
            $table->foreignId('imported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('line_count')->default(0);
            $table->unsignedInteger('duplicate_count')->default(0);
            $table->bigInteger('credit_total_laar')->default(0);
            $table->timestamps();
        });

        Schema::create('bank_statement_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('import_id')->constrained('bank_statement_imports')->cascadeOnDelete();
            $table->string('account', 16)->index();
            $table->date('txn_date')->index();
            $table->string('description', 500)->nullable();
            $table->string('reference', 120)->nullable();
            // Credits only — money in. Always positive.
            $table->bigInteger('amount_laar');
            $table->bigInteger('balance_laar')->nullable();
            // Same file uploaded twice must not count twice.
            $table->string('fingerprint', 64)->unique();
            // Transfers: the sale this line paid for.
            $table->foreignId('matched_payment_id')->nullable()->constrained('payments')->nullOnDelete();
            // 'auto' | 'manual' | 'unmatched' | 'ignored'
            $table->string('match_status', 16)->default('unmatched')->index();
            $table->timestamps();
        });

        Schema::create('cash_handovers', function (Blueprint $table): void {
            $table->id();
            $table->date('business_date')->unique();
            // What the owner actually received, in laari.
            $table->bigInteger('amount_laar');
            // What stayed in the drawer as tomorrow's float. Null = use the
            // shifts' opening float.
            $table->bigInteger('float_kept_laar')->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('notes', 500)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_handovers');
        Schema::dropIfExists('bank_statement_lines');
        Schema::dropIfExists('bank_statement_imports');
    }
};
