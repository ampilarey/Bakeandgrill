<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_schedules', function (Blueprint $table): void {
            $table->id();
            $table->string('key');
            $table->string('scope', 16)->default('shared');
            $table->string('locale', 8)->default('en');
            $table->longText('value')->nullable();
            $table->timestamp('publish_at');
            $table->string('status', 16)->default('pending'); // pending|published|cancelled
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'publish_at'], 'content_schedules_due');
            $table->index(['key', 'scope', 'locale'], 'content_schedules_block');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_schedules');
    }
};
