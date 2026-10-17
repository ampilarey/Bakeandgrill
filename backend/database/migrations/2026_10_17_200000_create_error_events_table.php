<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Errors counted by kind and day, for the morning digest and System → Health
 * (iruali import plan, feature 17). One row per fingerprint (class, file,
 * line) per day; kept 30 days.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('error_events', function (Blueprint $table) {
            $table->id();
            $table->date('day');
            $table->string('fingerprint', 40);
            $table->string('exception', 191);
            $table->text('message')->nullable();
            $table->string('file', 255)->nullable();
            $table->unsignedInteger('line')->nullable();
            $table->string('url', 500)->nullable();
            $table->unsignedInteger('count')->default(1);
            $table->boolean('payment')->default(false);
            $table->timestamp('first_seen_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('alerted_at')->nullable();
            $table->unique(['fingerprint', 'day']);
            $table->index(['day', 'last_seen_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('error_events');
    }
};
