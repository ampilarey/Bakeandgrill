<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Owner, 2026-10-12: "Standard footer options with standard branding
 * footer. Option to add complaint qr with its branding." A custom label
 * picks its footer (its brand's, the standard Bake & Grill one, or its own
 * words), says whether the complaints QR prints (null follows the label
 * type), and remembers the language it is usually printed in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->string('label_footer_style', 12)->default('brand')->after('label_footer_dv');
            $table->boolean('label_show_qr')->nullable()->after('label_footer_style');
            $table->string('label_lang', 5)->nullable()->after('label_show_qr');
        });
        // A label that already had its own footer line keeps printing it.
        DB::table('custom_labels')
            ->where(fn ($q) => $q->whereNotNull('label_footer')->orWhereNotNull('label_footer_dv'))
            ->update(['label_footer_style' => 'own']);
    }

    public function down(): void
    {
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->dropColumn(['label_footer_style', 'label_show_qr', 'label_lang']);
        });
    }
};
