<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('page_blocks', function (Blueprint $table) {
            $table->id();
            $table->string('app', 32); // website | order_app
            $table->string('page', 64)->default('home');
            $table->string('block_type', 64);
            $table->unsignedInteger('position')->default(0);
            $table->boolean('is_enabled')->default(true);
            $table->string('content_mode', 16)->default('shared'); // shared | own
            $table->json('settings')->nullable();
            $table->timestamps();

            $table->index(['app', 'page', 'position']);
            $table->index(['app', 'page', 'block_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('page_blocks');
    }
};
