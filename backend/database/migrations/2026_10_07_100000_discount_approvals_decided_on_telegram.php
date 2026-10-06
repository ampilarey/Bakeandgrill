<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Discount approval by button (owner, 2026-10-07): an approver can tap
 * Approve or Decline on Telegram instead of reading a code out. The till
 * sees the decision and carries on. Who decided, and when, are kept here;
 * status gains "granted" (approved on Telegram, not applied yet) and
 * "declined".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('discount_approvals', function (Blueprint $table) {
            $table->foreignId('decided_by')->nullable()->after('approved_by')->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable()->after('decided_by');
        });
    }

    public function down(): void
    {
        Schema::table('discount_approvals', function (Blueprint $table) {
            $table->dropConstrainedForeignId('decided_by');
            $table->dropColumn('decided_at');
        });
    }
};
