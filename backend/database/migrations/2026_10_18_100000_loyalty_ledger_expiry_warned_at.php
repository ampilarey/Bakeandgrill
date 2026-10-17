<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** When the customer was told these points expire soon (iruali import plan, feature 13). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_ledger', function (Blueprint $table) {
            $table->timestamp('expiry_warned_at')->nullable()->after('expiry_processed');
        });
    }

    public function down(): void
    {
        Schema::table('loyalty_ledger', function (Blueprint $table) {
            $table->dropColumn('expiry_warned_at');
        });
    }
};
