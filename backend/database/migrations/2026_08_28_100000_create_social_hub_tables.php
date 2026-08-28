<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Social Hub core (plan: docs/SOCIAL_SHARING_PLAN.md §2c).
 *
 * - social_channels: connected accounts. Credentials are an encrypted,
 *   write-only blob; is_test_channel marks accounts the fail-closed
 *   environment guard may publish to outside production.
 * - social_posts: what to say, frozen as an immutable snapshot at
 *   scheduling time so later item edits never silently change a post.
 * - social_post_deliveries: one row per post × channel — the delivery
 *   state machine, provider ids, attempt history, and the nullable-unique
 *   dedupe_key that makes automated posting idempotent per business date.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_channels', function (Blueprint $table) {
            $table->id();
            $table->string('platform', 32); // facebook|instagram|telegram
            $table->string('name', 100);
            $table->text('credentials')->nullable(); // encrypted:array cast
            $table->string('remote_account_id', 100)->nullable();
            $table->boolean('is_enabled')->default(false);
            $table->boolean('is_test_channel')->default(false);
            $table->timestamp('last_published_at')->nullable();
            $table->timestamps();

            $table->index(['platform', 'is_enabled']);
        });

        Schema::create('social_posts', function (Blueprint $table) {
            $table->id();
            $table->string('status', 24)->default('draft');
            // Frozen at scheduling: caption, image_url, image_fingerprint,
            // link_url, price/terms as displayed, offer end date, source refs.
            $table->json('snapshot');
            $table->string('source', 40)->default('manual');
            $table->string('source_ref', 100)->nullable();
            $table->date('business_date')->nullable(); // Maldives-local day, for dedupe
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'scheduled_at']);
            $table->index(['source', 'source_ref']);
        });

        Schema::create('social_post_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('social_post_id')->constrained('social_posts')->cascadeOnDelete();
            $table->foreignId('social_channel_id')->constrained('social_channels');
            $table->string('status', 24)->default('queued');
            // Automation idempotency: e.g. "auto_special:12:2026-08-28:3".
            // NULL for manual posts — NULLs never collide in a unique index,
            // so retries/restarts cannot double-post automated content but
            // a human can post the same thing twice on purpose.
            $table->string('dedupe_key', 191)->nullable()->unique();
            $table->string('provider_container_id', 191)->nullable();
            $table->string('provider_post_id', 191)->nullable();
            $table->string('permalink', 500)->nullable();
            $table->string('error_class', 32)->nullable(); // auth|validation|rate_limit|transient|unknown
            $table->text('error_message')->nullable();
            $table->json('attempts')->nullable(); // [{at, outcome, error?}, …]
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->index(['social_post_id', 'social_channel_id']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_post_deliveries');
        Schema::dropIfExists('social_posts');
        Schema::dropIfExists('social_channels');
    }
};
