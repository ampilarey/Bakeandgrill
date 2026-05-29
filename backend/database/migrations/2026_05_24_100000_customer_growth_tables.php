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
        Schema::create('customer_tags', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->string('color', 20)->nullable();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('customer_tag_assignments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_tag_id')->constrained()->cascadeOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['customer_id', 'customer_tag_id']);
        });

        Schema::create('customer_follow_up_notes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('staff_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('note');
            $table->timestamp('follow_up_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'completed_at']);
        });

        $now = now();
        $defaults = [
            ['VIP', '#D4813A', 'High-value repeat customer'],
            ['At Risk', '#EF4444', 'Dormant or declining engagement'],
            ['Corporate', '#3B82F6', 'Business or office account'],
            ['Birthday Month', '#EC4899', 'Birthday outreach candidate'],
            ['New', '#22C55E', 'Recently joined'],
            ['Needs Follow-up', '#F59E0B', 'Staff follow-up required'],
        ];

        foreach ($defaults as [$name, $color, $description]) {
            DB::table('customer_tags')->insert([
                'name' => $name,
                'color' => $color,
                'description' => $description,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_follow_up_notes');
        Schema::dropIfExists('customer_tag_assignments');
        Schema::dropIfExists('customer_tags');
    }
};
