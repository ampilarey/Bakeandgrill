<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_revisions', function (Blueprint $table): void {
            $table->id();
            $table->string('key');
            $table->string('scope', 16)->default('shared');
            $table->string('locale', 8)->default('en');
            $table->longText('value')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['key', 'scope', 'locale', 'created_at'], 'content_revisions_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_revisions');
    }
};
