<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Change the refunds.user_id foreign key from CASCADE DELETE to SET NULL.
     * Deleting a staff account must not destroy the refund audit trail —
     * financial records must be preserved even when the initiating user is removed.
     */
    public function up(): void
    {
        Schema::table('refunds', function (Blueprint $table) {
            // Drop the existing FK constraint
            $table->dropForeign(['user_id']);
            // Make the column nullable and re-add with nullOnDelete
            $table->foreignId('user_id')->nullable()->change();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('refunds', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->foreignId('user_id')->nullable(false)->change();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
