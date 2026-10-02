<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Permissions\RolePermissionCustomisations;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Permissions audit, 2026-10-02: the owner's changes to a stock role are
 * kept apart from the catalog so the deploy-time sync stops undoing them.
 * The decisions already made are recovered from the audit log and applied
 * straight away, so "Void orders" is back on Staff after this runs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create(RolePermissionCustomisations::TABLE, function (Blueprint $table) {
            $table->id();
            $table->string('role_slug', 64);
            $table->string('permission_slug', 128);
            $table->boolean('granted');
            $table->unsignedBigInteger('set_by')->nullable();
            $table->timestamps();
            $table->unique(['role_slug', 'permission_slug'], 'role_permission_customisations_unique');
            $table->foreign('set_by')->references('id')->on('users')->nullOnDelete();
        });

        RolePermissionCustomisations::rebuildFromAuditLog();
        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        Schema::dropIfExists(RolePermissionCustomisations::TABLE);
    }
};
