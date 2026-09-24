<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Saved campaign audiences (SMS audit, 2026-09-24): a name over a set of
 * targeting criteria, so "Delivery regulars" or "Fans of the chicken
 * burger" is built once and reused, and a scheduled campaign that names
 * one resolves whatever it means on the day it sends.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_audiences', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 100);
            $table->string('description', 300)->nullable();
            $table->json('criteria');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_audiences');
    }
};
