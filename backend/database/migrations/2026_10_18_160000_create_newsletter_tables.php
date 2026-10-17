<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** The email newsletter (iruali import plan, feature 4). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('newsletter_subscribers', function (Blueprint $table) {
            $table->id();
            $table->string('email')->unique();
            $table->string('locale', 5)->default('en');
            $table->string('token', 64)->unique();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('unsubscribed_at')->nullable();
            $table->string('source', 32)->default('website');
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('newsletter_issues', function (Blueprint $table) {
            $table->id();
            $table->string('subject_en', 150);
            $table->string('subject_dv', 150)->nullable();
            $table->text('body_en')->nullable();
            $table->text('body_dv')->nullable();
            $table->string('header_image_url', 500)->nullable();
            $table->json('sections')->nullable();
            $table->json('removed_item_ids')->nullable();
            $table->json('frozen')->nullable();
            $table->string('status', 16)->default('draft');
            $table->timestamp('sent_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('newsletter_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('issue_id')->constrained('newsletter_issues')->cascadeOnDelete();
            $table->foreignId('subscriber_id')->constrained('newsletter_subscribers')->cascadeOnDelete();
            $table->string('email');
            $table->string('locale', 5)->default('en');
            $table->string('status', 16)->default('pending');
            $table->timestamp('sent_at')->nullable();
            $table->string('error', 500)->nullable();
            $table->timestamps();
            $table->unique(['issue_id', 'email']);
            $table->index(['issue_id', 'status']);
        });

        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        Schema::dropIfExists('newsletter_deliveries');
        Schema::dropIfExists('newsletter_issues');
        Schema::dropIfExists('newsletter_subscribers');
    }
};
