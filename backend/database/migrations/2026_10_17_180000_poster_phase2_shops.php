<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 2 of docs/POSTER_PLAN.md: a print shop is a supplier, an order
 * tracks the file through the shop, and each export remembers what the
 * menu said so a later change can be diffed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('kind')->default('supplier')->after('is_active');
            $table->json('print_prefs')->nullable()->after('kind');
        });

        Schema::table('poster_exports', function (Blueprint $table) {
            $table->string('bound_hash', 64)->nullable()->after('error');
            $table->text('diff')->nullable()->after('bound_hash');
            $table->json('snapshot')->nullable()->after('diff');
        });

        Schema::create('poster_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poster_id')->constrained('posters')->cascadeOnDelete();
            $table->foreignId('poster_export_id')->nullable()->constrained('poster_exports')->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->string('state')->default('draft');
            $table->json('quantities')->nullable();
            $table->string('material')->default('foam');
            $table->string('finish')->default('matte');
            $table->string('gloss')->default('none');
            $table->string('white')->default('none');
            $table->string('mounting')->default('none');
            $table->string('imposition')->default('single');
            $table->date('deadline')->nullable();
            $table->string('place')->nullable();
            $table->decimal('quote_mvr', 10, 2)->nullable();
            $table->string('quote_note')->nullable();
            $table->foreignId('expense_id')->nullable()->constrained('expenses')->nullOnDelete();
            $table->json('state_log')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        DB::table('permissions')->where('slug', 'posters.manage')->update([
            'description' => 'Templates, print shops, and approving proofs and quotes',
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('poster_orders');
        Schema::table('poster_exports', function (Blueprint $table) {
            $table->dropColumn(['bound_hash', 'diff', 'snapshot']);
        });
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn(['kind', 'print_prefs']);
        });
    }
};
