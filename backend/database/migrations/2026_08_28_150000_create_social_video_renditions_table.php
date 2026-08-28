<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rendition records for the social video renderer (plan, video section):
 * one row per item × format, carrying the media facts (dimensions, bytes,
 * mime, storage paths, poster) and a source fingerprint (photo set + name +
 * price + settings) so a change to the source invalidates the render.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_video_renditions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->string('format', 16); // vertical | square | landscape
            $table->string('status', 16)->default('queued'); // queued|processing|ready|failed
            $table->string('source_fingerprint', 64);
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->unsignedBigInteger('bytes')->nullable();
            $table->string('mime', 64)->nullable();
            $table->string('path', 500)->nullable(); // public-disk relative
            $table->string('poster_path', 500)->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            // One rendition per item × format; regeneration replaces in place.
            $table->unique(['item_id', 'format']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_video_renditions');
    }
};
