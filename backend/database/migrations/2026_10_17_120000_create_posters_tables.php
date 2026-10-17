<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 1 of docs/POSTER_PLAN.md: the posters the owner makes, the
 * templates saved from them, and each queued export. Print-shop orders
 * and scan counts wait for later phases.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('posters', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('template_key');
            $table->string('layout');
            $table->string('mood')->default('dark');
            $table->string('language')->default('both');
            $table->boolean('landscape')->default(false);
            $table->json('sizes');
            $table->json('slots');
            $table->json('bindings');
            $table->string('state')->default('draft');
            $table->date('take_down_on')->nullable();
            $table->string('place')->nullable();
            $table->boolean('pinned')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('poster_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('template_key');
            $table->string('layout');
            $table->string('mood')->default('dark');
            $table->string('language')->default('both');
            $table->json('slots');
            $table->boolean('locked')->default(false);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('poster_exports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poster_id')->constrained('posters')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->string('status')->default('queued');
            $table->json('request');
            $table->json('preflight')->nullable();
            $table->string('zip_path')->nullable();
            $table->unsignedInteger('bytes')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();
        });

        $now = now();
        foreach ([
            ['posters.make', 'Make posters', 'Make, edit and download print files'],
            ['posters.manage', 'Manage poster templates', 'Save, lock and delete poster templates'],
        ] as [$slug, $name, $description]) {
            DB::table('permissions')->updateOrInsert(
                ['slug' => $slug],
                ['name' => $name, 'group' => 'Marketing', 'description' => $description, 'created_at' => $now, 'updated_at' => $now],
            );
        }

        $ownerId = (int) DB::table('roles')->where('slug', 'owner')->value('id');
        $managerId = (int) DB::table('roles')->where('slug', 'manager')->value('id');
        foreach (['posters.make', 'posters.manage'] as $slug) {
            $permissionId = (int) DB::table('permissions')->where('slug', $slug)->value('id');
            if ($permissionId > 0 && $ownerId > 0) {
                DB::table('role_permission')->updateOrInsert(
                    ['role_id' => $ownerId, 'permission_id' => $permissionId],
                    [],
                );
            }
            // Managers make and send. Locking templates stays with the owner.
            if ($slug === 'posters.make' && $permissionId > 0 && $managerId > 0) {
                DB::table('role_permission')->updateOrInsert(
                    ['role_id' => $managerId, 'permission_id' => $permissionId],
                    [],
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('poster_exports');
        Schema::dropIfExists('poster_templates');
        Schema::dropIfExists('posters');

        $ids = DB::table('permissions')->whereIn('slug', ['posters.make', 'posters.manage'])->pluck('id');
        if ($ids->isNotEmpty()) {
            DB::table('role_permission')->whereIn('permission_id', $ids)->delete();
            DB::table('permissions')->whereIn('id', $ids)->delete();
        }
    }
};
