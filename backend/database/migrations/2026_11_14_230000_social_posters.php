<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Social Hub → Make a post (owner, 2026-11-14): a saved post keeps what it
 * says and the design it wears, so it opens again as it was left.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_posters', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 120);
            $table->string('layout', 40);
            $table->string('palette', 40);
            $table->json('spec');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_posters');
    }
};
