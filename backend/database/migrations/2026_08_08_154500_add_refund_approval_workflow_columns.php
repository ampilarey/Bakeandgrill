<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two-step refund approval: request → approve/reject.
 * Historical rows stay status=approved; requester columns stay null (no backfill).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('refunds', function (Blueprint $table): void {
            $table->foreignId('approved_by')->nullable()->after('user_id')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('requested_at')->nullable()->after('reason');
            $table->timestamp('approved_at')->nullable()->after('requested_at');
            $table->string('reason_category', 64)->nullable()->after('reason');
            $table->text('rejection_reason')->nullable()->after('reason_category');
            $table->boolean('no_customer_contact')->default(false)->after('rejection_reason');
        });

        // Historical rows stay status=approved with null requester/approver timestamps —
        // do not backfill.
    }

    public function down(): void
    {
        Schema::table('refunds', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('approved_by');
            $table->dropColumn([
                'requested_at',
                'approved_at',
                'reason_category',
                'rejection_reason',
                'no_customer_contact',
            ]);
        });
    }
};
