<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which messages a customer wants by SMS and by email (iruali import plan,
 * feature 5). Null means the defaults in MessageChoices.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->json('message_prefs')->nullable()->after('sms_opt_out_source');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('message_prefs');
        });
    }
};
