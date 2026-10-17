<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Better reviews (iruali import plan, feature 6): photos, helpful votes and the restaurant's reply. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reviews', function (Blueprint $table) {
            $table->json('photos')->nullable()->after('comment');
            $table->unsignedInteger('helpful_count')->default(0)->after('photos');
            $table->text('reply')->nullable()->after('helpful_count');
            $table->timestamp('replied_at')->nullable()->after('reply');
            $table->foreignId('replied_by')->nullable()->after('replied_at')->constrained('users')->nullOnDelete();
        });

        Schema::create('review_votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('review_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();
            $table->unique(['review_id', 'customer_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('review_votes');
        Schema::table('reviews', function (Blueprint $table) {
            $table->dropConstrainedForeignId('replied_by');
            $table->dropColumn(['photos', 'helpful_count', 'reply', 'replied_at']);
        });
    }
};
