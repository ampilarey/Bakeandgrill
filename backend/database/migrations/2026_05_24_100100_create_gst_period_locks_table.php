<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gst_period_locks', function (Blueprint $table) {
            $table->id();
            $table->string('period_key', 10)->unique();
            $table->timestamp('locked_at');
            $table->foreignId('locked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->bigInteger('carry_forward_input_laar')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gst_period_locks');
    }
};
