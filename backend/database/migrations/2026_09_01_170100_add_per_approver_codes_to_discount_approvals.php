<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One approval code per approver, so the record names who actually approved.
 *
 * The code was a single number texted to every approver, and confirm() then
 * credited `approvers[0]` whatever happened. With one approver configured that
 * was true by luck; with two or more the order and the audit log both named the
 * wrong manager — and naming the manager is the entire point of the approval
 * flow. Owner audit, 2026-09-01.
 *
 * Each approver now gets their own code, and the code that comes back
 * identifies the person who gave it. `approved_label` carries the approver's
 * name for the phone-only entries that have no user row to point at.
 *
 * `code_hash` stays for approvals already in flight when this deploys.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('discount_approvals')) {
            return;
        }

        Schema::table('discount_approvals', function (Blueprint $table) {
            if (!Schema::hasColumn('discount_approvals', 'approver_codes')) {
                $table->json('approver_codes')->nullable()->after('code_hash');
            }
            if (!Schema::hasColumn('discount_approvals', 'approved_label')) {
                $table->string('approved_label', 120)->nullable()->after('approver_codes');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('discount_approvals')) {
            return;
        }

        Schema::table('discount_approvals', function (Blueprint $table) {
            foreach (['approver_codes', 'approved_label'] as $column) {
                if (Schema::hasColumn('discount_approvals', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
