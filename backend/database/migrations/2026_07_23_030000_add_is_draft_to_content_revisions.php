<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('content_revisions')) {
            return;
        }
        Schema::table('content_revisions', function (Blueprint $table) {
            if (!Schema::hasColumn('content_revisions', 'is_draft')) {
                $table->boolean('is_draft')->default(false)->after('value');
            }
            if (!Schema::hasColumn('content_revisions', 'published_at')) {
                $table->timestamp('published_at')->nullable()->after('is_draft');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('content_revisions')) {
            return;
        }
        Schema::table('content_revisions', function (Blueprint $table) {
            if (Schema::hasColumn('content_revisions', 'published_at')) {
                $table->dropColumn('published_at');
            }
            if (Schema::hasColumn('content_revisions', 'is_draft')) {
                $table->dropColumn('is_draft');
            }
        });
    }
};
