<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('content_drafts')) {
            Schema::create('content_drafts', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('key');
                $table->string('scope', 16)->default('shared');
                $table->string('locale', 8)->default('en');
                $table->longText('value')->nullable();
                $table->unsignedBigInteger('version')->default(0);
                $table->timestamps();

                $table->unique(['user_id', 'key', 'scope', 'locale'], 'content_drafts_user_key_scope_locale_unique');
                $table->index(['key', 'scope', 'locale'], 'content_drafts_lookup');
            });
        }

        $this->migrateRevisionDrafts();
    }

    public function down(): void
    {
        Schema::dropIfExists('content_drafts');
    }

    private function migrateRevisionDrafts(): void
    {
        if (
            ! Schema::hasTable('content_revisions')
            || ! Schema::hasColumn('content_revisions', 'is_draft')
        ) {
            return;
        }

        $fallbackUserId = DB::table('users')
            ->join('roles', 'roles.id', '=', 'users.role_id')
            ->where('roles.slug', 'owner')
            ->orderBy('users.id')
            ->value('users.id')
            ?? DB::table('users')->orderBy('id')->value('id');

        $seen = [];
        $rows = DB::table('content_revisions')
            ->where('is_draft', true)
            ->orderByDesc('id')
            ->get(['id', 'user_id', 'key', 'scope', 'locale', 'value', 'created_at']);

        foreach ($rows as $row) {
            $userId = $row->user_id ?: $fallbackUserId;
            if (! $userId) {
                continue;
            }

            $scope = (string) ($row->scope ?: 'shared');
            $locale = (string) ($row->locale ?: 'en');
            $dedupeKey = implode('|', [$userId, $row->key, $scope, $locale]);
            if (isset($seen[$dedupeKey])) {
                continue;
            }
            $seen[$dedupeKey] = true;

            DB::table('content_drafts')->updateOrInsert(
                [
                    'user_id' => $userId,
                    'key' => (string) $row->key,
                    'scope' => $scope,
                    'locale' => $locale,
                ],
                [
                    'value' => $row->value,
                    'version' => 1,
                    'created_at' => $row->created_at ?? now(),
                    'updated_at' => $row->created_at ?? now(),
                ],
            );
        }

        DB::table('content_revisions')->where('is_draft', true)->delete();
    }
};
