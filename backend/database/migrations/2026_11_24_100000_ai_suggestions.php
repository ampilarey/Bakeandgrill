<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the assistant proposes by itself (owner, 2026-11-24: "since menu is public add
 * admin approval. And can add automatic dhivehi and rest of the possible automatic
 * updates?"). A row is a proposed change that waits; nothing it names changes until a
 * person approves it on System → Integrations → Suggestions.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_suggestions', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 40);
            $table->string('subject_type', 30);
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('subject_label');
            $table->json('before')->nullable();   // what was there when it was proposed
            $table->json('proposed');
            $table->string('reason', 255)->nullable();
            $table->string('status', 12)->default('pending'); // pending | approved | rejected | stale
            // One open proposal per subject and kind: what it is about, folded.
            $table->string('subject_key', 80);
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'kind']);
            $table->index(['kind', 'subject_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_suggestions');
    }
};
