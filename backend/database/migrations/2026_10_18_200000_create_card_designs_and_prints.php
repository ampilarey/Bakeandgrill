<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Printed cards (owner, 2026-10-18: "design and print discount cards" on a CR80 card
 * printer, "should not limit to a specific card brand"): saved card designs and a log of
 * what was printed. App\Domains\Cards.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('card_designs', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->json('settings');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('card_prints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('card_design_id')->nullable()->constrained('card_designs')->nullOnDelete();
            $table->string('source', 24);
            $table->unsignedBigInteger('source_id')->nullable();
            $table->unsignedInteger('cards');
            $table->string('output', 12);
            $table->string('sides', 24);
            $table->string('note', 200)->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['source', 'source_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('card_prints');
        Schema::dropIfExists('card_designs');
    }
};
