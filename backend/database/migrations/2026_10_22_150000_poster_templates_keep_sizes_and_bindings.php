<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A saved poster template keeps its sizes and the dish or offer it was bound
 * to (poster audit, 2026-10-22): until now Use reset a template to A4 with
 * nothing bound, so a template's live price and photo were lost.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('poster_templates', function (Blueprint $table): void {
            $table->json('sizes')->nullable()->after('slots');
            $table->json('bindings')->nullable()->after('sizes');
        });
    }

    public function down(): void
    {
        Schema::table('poster_templates', function (Blueprint $table): void {
            $table->dropColumn(['sizes', 'bindings']);
        });
    }
};
