<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner's shortlist (2026-09-24), the engagement half:
 *
 *  - social_comments: comments pulled from Facebook and Instagram on our
 *    posts, with reply and read state, so staff answer from admin.
 *  - social_link_visits: a visit to a /menu link that carried ?s=<delivery>,
 *    so a post's insights show visits, not just likes.
 *  - orders.social_delivery_id: the post a web order came from (cookie set
 *    on that visit), so insights show orders too.
 *  - item_share_events: a customer pressing Share on an item or category
 *    on the website or order app, so the owner sees what gets shared.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('social_post_delivery_id')->constrained('social_post_deliveries')->cascadeOnDelete();
            $table->string('provider_comment_id', 191)->unique();
            $table->string('author', 191)->nullable();
            $table->text('text');
            $table->timestamp('posted_at')->nullable();
            $table->boolean('flagged')->default(false); // looks like a question about ordering
            $table->timestamp('read_at')->nullable();
            $table->timestamp('replied_at')->nullable();
            $table->text('reply_text')->nullable();
            $table->string('reply_provider_id', 191)->nullable();
            $table->timestamps();

            $table->index(['read_at', 'posted_at']);
        });

        Schema::create('social_link_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('social_post_delivery_id')->constrained('social_post_deliveries')->cascadeOnDelete();
            $table->string('path', 255);
            $table->string('visitor_hash', 64);
            $table->timestamp('created_at')->nullable();

            $table->index(['social_post_delivery_id', 'created_at']);
            $table->index(['visitor_hash', 'created_at']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedBigInteger('social_delivery_id')->nullable()->after('idempotency_key')->index();
        });

        Schema::create('item_share_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('item_id')->nullable()->index();
            $table->unsignedBigInteger('category_id')->nullable()->index();
            $table->string('channel', 24); // native|copy|whatsapp|telegram|viber|facebook|x
            $table->string('surface', 16)->default('web'); // web|order
            $table->timestamp('created_at')->nullable();

            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_share_events');
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('social_delivery_id');
        });
        Schema::dropIfExists('social_link_visits');
        Schema::dropIfExists('social_comments');
    }
};
