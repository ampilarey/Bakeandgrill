<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A bill sent to the staff bot as a photo: where to send the reading back to. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_bills', function (Blueprint $table) {
            $table->foreignId('telegram_link_id')->nullable()->after('user_id')->constrained('telegram_links')->nullOnDelete();
            $table->timestamp('telegram_told_at')->nullable()->after('telegram_link_id');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_bills', function (Blueprint $table) {
            $table->dropConstrainedForeignId('telegram_link_id');
            $table->dropColumn('telegram_told_at');
        });
    }
};
