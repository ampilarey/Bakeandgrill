<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where an opt-out (or opt back in) came from — the website form, the
 * order app, admin, or the API (SMS audit, 2026-09-24), so a complaint
 * about a text can be answered with the record.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->string('sms_opt_out_source', 40)->nullable()->after('sms_opt_out_at');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->dropColumn('sms_opt_out_source');
        });
    }
};
