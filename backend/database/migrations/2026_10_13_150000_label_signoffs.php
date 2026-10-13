<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The wording lock (round 17 of the labels usability work, owner,
 * 2026-10-13: "a wording lock with sign-off for legal lines, plus the print
 * log already kept"): each sign-off keeps the legal lines of one product as
 * they stood, who signed them off and when. Never edited: a change is a new
 * sign-off.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('label_signoffs', function (Blueprint $table): void {
            $table->id();
            $table->string('kind', 8);
            $table->unsignedBigInteger('product_id');
            $table->string('hash', 64);
            $table->json('lines');
            $table->string('note', 200)->nullable();
            $table->foreignId('signed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable();
            $table->index(['kind', 'product_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('label_signoffs');
    }
};
