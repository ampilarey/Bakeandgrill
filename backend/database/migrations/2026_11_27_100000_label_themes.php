<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Label themes (owner, 2026-11-27: "add more nice themes to each template and custom labels also"): the colours a
 * menu item's or a custom label's sticker prints in (`label_theme`, a key of App\Domains\Labels\LabelTheme::THEMES;
 * null is the brand's rust, as every label printed until now).
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['items', 'custom_labels'] as $name) {
            if (!Schema::hasColumn($name, 'label_theme')) {
                Schema::table($name, function (Blueprint $table) {
                    $table->string('label_theme', 20)->nullable();
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['items', 'custom_labels'] as $name) {
            if (Schema::hasColumn($name, 'label_theme')) {
                Schema::table($name, function (Blueprint $table) {
                    $table->dropColumn('label_theme');
                });
            }
        }
    }
};
