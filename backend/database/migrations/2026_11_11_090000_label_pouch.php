<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pouch labels (owner, 2026-11-11: the frozen momo's zip pouch, "for
 * different type of background… steam, frying and other types"): a product's
 * pouch look and cooking method (`label_pouch`, JSON;
 * App\Domains\Labels\PouchConfig). Null is an ordinary sticker.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['items', 'custom_labels'] as $name) {
            if (!Schema::hasColumn($name, 'label_pouch')) {
                Schema::table($name, function (Blueprint $table) {
                    $table->json('label_pouch')->nullable();
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['items', 'custom_labels'] as $name) {
            if (Schema::hasColumn($name, 'label_pouch')) {
                Schema::table($name, function (Blueprint $table) {
                    $table->dropColumn('label_pouch');
                });
            }
        }
    }
};
