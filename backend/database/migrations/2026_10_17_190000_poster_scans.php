<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row each time someone opens /p/{code}. The code and the time only —
 * nothing about the phone (docs/POSTER_PLAN.md § 10).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('poster_scans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poster_id')->constrained('posters')->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->index('poster_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poster_scans');
    }
};
