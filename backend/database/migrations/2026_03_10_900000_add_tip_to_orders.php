<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->decimal('tip_amount', 10, 2)->default(0)->after('total');
            $table->unsignedSmallInteger('estimated_wait_minutes')->nullable()->after('tip_amount');
        });

        Schema::create('staff_schedules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('date');
            $table->time('shift_start');
            $table->time('shift_end');
            $table->string('role_override', 60)->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_confirmed')->default(false);
            $table->timestamps();

            $table->unique(['user_id', 'date']);
            $table->index('date');
        });

        Schema::create('waste_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('item_id')->nullable()->constrained('items')->nullOnDelete();
            $table->foreignId('inventory_item_id')->nullable()->constrained('inventory_items')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('quantity', 10, 3);
            $table->string('unit', 20)->default('pcs');
            $table->decimal('cost_estimate', 10, 2)->nullable();
            $table->enum('reason', ['spoilage', 'over_prep', 'drop', 'expired', 'quality', 'other'])->default('other');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['item_id', 'created_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waste_logs');
        Schema::dropIfExists('staff_schedules');
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn(['tip_amount', 'estimated_wait_minutes']);
        });
    }
};
