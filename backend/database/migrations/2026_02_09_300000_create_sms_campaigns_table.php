<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_campaigns', function (Blueprint $table): void {
            $table->id();

            $table->string('name');
            $table->text('message');
            $table->text('notes')->nullable();

            // Status machine: draft → scheduled → running → completed / cancelled
            $table->string('status', 20)->default('draft');

            // Targeting: JSON criteria applied to customers table
            // e.g. {"tier": ["gold","silver"], "last_order_days": 30, "opted_in": true}
            $table->json('target_criteria')->nullable();

            // Stats (denormalised counters updated as jobs run)
            $table->unsignedInteger('total_recipients')->default(0);
            $table->unsignedInteger('sent_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->decimal('total_cost_mvr', 10, 2)->default(0);

            // Scheduling
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index('status');
            $table->index('scheduled_at');
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('sms_campaigns');
    }
};
