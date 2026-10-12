<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Owner, 2026-10-12: "can u add option to edit footer also" on a custom
 * label. A footer line of its own, in English and Dhivehi, printed where the
 * brand's tagline or the website would be (the phone stays).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->string('label_footer', 120)->nullable()->after('label_note_dv');
            $table->string('label_footer_dv', 120)->nullable()->after('label_footer');
        });
    }

    public function down(): void
    {
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->dropColumn(['label_footer', 'label_footer_dv']);
        });
    }
};
