<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Supplier bills sent in to be read (owner, 2026-11-15: "a pile of bills to enter").
 * A row is one photo, scan or PDF: queued, then read into `data`, then checked by a
 * person and turned into a purchase.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('file_path');
            $table->string('file_name');
            $table->string('mime_type', 80);
            $table->string('file_hash', 40)->index();
            // queued → reading → ready | failed; done once it became a purchase.
            $table->string('status', 20)->default('queued')->index();
            $table->timestamp('reading_at')->nullable();
            $table->json('data')->nullable();
            $table->string('error', 500)->nullable();
            $table->foreignId('purchase_id')->nullable()->constrained('purchases')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_bills');
    }
};
