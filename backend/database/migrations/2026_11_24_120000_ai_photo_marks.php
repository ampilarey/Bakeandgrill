<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the assistant has already looked at (owner, 2026-11-24: "I need generate food
 * photo too. And build all the features"), so a photo is looked at once and not every
 * night: the dish photo it saw, the library picture it described, the review photo it
 * noted. And a mark on a dish whose photo was made by the image service, not taken.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('ai_photo_seen', 64)->nullable();
            $table->boolean('image_ai_generated')->default(false);
        });
        Schema::table('media_assets', function (Blueprint $table) {
            $table->timestamp('ai_described_at')->nullable();
        });
        Schema::table('reviews', function (Blueprint $table) {
            $table->string('photo_note', 255)->nullable();
            $table->timestamp('photo_noted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('items', fn (Blueprint $table) => $table->dropColumn(['ai_photo_seen', 'image_ai_generated']));
        Schema::table('media_assets', fn (Blueprint $table) => $table->dropColumn('ai_described_at'));
        Schema::table('reviews', fn (Blueprint $table) => $table->dropColumn(['photo_note', 'photo_noted_at']));
    }
};
