<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Label Hub v2, step 4 (docs/LABEL_HUB_V2_PLAN.md point 10). Owner,
 * 2026-10-04: "created labels must be saved, redownloaded, reprinted,
 * reedited". A job is one prepared print, kept with the request that made
 * it, so it can be printed again, downloaded, opened back in the form,
 * copied or renamed. The print log (label_prints) stays as the record of
 * each run.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('label_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 12); // stickers | box
            $table->string('name', 80);
            $table->json('request');
            $table->json('summary')->nullable();
            // The same request prepared twice is one job printed twice.
            $table->string('request_hash', 64)->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('print_count')->default(0);
            $table->timestamp('last_printed_at')->nullable();
            $table->timestamps();
            $table->index(['kind', 'last_printed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('label_jobs');
    }
};
