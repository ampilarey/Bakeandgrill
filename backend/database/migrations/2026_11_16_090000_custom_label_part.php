<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lid and side labels (owner, 2026-11-16: "on the top of the container circular
 * label with name and photo. At the side rectangular label with other details"):
 * which part of a tub a custom label is for (`label_part`: lid | side;
 * App\Domains\Labels\TubSet). Null is an ordinary label.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('custom_labels', 'label_part')) {
            Schema::table('custom_labels', function (Blueprint $table) {
                $table->string('label_part', 10)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('custom_labels', 'label_part')) {
            Schema::table('custom_labels', function (Blueprint $table) {
                $table->dropColumn('label_part');
            });
        }
    }
};
