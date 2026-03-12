<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('time_punches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('clocked_in_at');
            $table->timestamp('clocked_out_at')->nullable();
            $table->decimal('break_minutes', 6, 2)->default(0);
            $table->decimal('total_hours', 8, 4)->nullable();
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'clocked_in_at']);
        });

        Schema::table('purchase_items', function (Blueprint $table) {
            $table->decimal('received_quantity', 10, 4)->nullable()->after('quantity');
            $table->timestamp('received_at')->nullable()->after('received_quantity');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('time_punches');
        Schema::table('purchase_items', function (Blueprint $table) {
            $table->dropColumn(['received_quantity', 'received_at']);
        });
    }
};
