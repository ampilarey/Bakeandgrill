<?php

declare(strict_types=1);

use App\Domains\Content\DefaultItemImageSync;
use Illuminate\Database\Migrations\Migration;

/**
 * Content Studio often wrote default_item_image to website scope only.
 * Order-app public content is cached forever — sync scopes + bust so
 * /api/content?app=order_app picks up the photo without a re-upload.
 */
return new class extends Migration
{
    public function up(): void
    {
        DefaultItemImageSync::run();
    }

    public function down(): void
    {
        // Non-destructive sync — nothing to reverse.
    }
};
