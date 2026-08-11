<?php

declare(strict_types=1);

use App\Domains\Content\Blocks\BlockTypeRegistry;
use App\Domains\Content\Blocks\GenericBlockPresenter;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('page_block_shared_contents')) {
            Schema::create('page_block_shared_contents', function (Blueprint $table): void {
                $table->id();
                $table->char('uuid', 36)->unique();
                $table->string('block_type', 64);
                $table->json('settings')->nullable();
                $table->timestamps();

                $table->index('block_type');
            });
        }

        if (Schema::hasTable('page_blocks') && ! Schema::hasColumn('page_blocks', 'shared_content_id')) {
            Schema::table('page_blocks', function (Blueprint $table): void {
                $table->foreignId('shared_content_id')
                    ->nullable()
                    ->after('content_mode')
                    ->constrained('page_block_shared_contents')
                    ->nullOnDelete();
            });
        }

        $this->backfillSharedGenericBlocks();
        $this->addSingletonKey();

        if (! Schema::hasTable('page_layout_drafts')) {
            Schema::create('page_layout_drafts', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('app', 32);
                $table->string('page', 64)->default('home');
                $table->unsignedBigInteger('version')->default(1);
                $table->longText('payload')->nullable();
                $table->timestamps();

                $table->unique(['user_id', 'app', 'page'], 'page_layout_drafts_user_app_page_unique');
                $table->index(['app', 'page']);
            });
        }

        if (! Schema::hasTable('page_layout_revisions')) {
            Schema::create('page_layout_revisions', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('app', 32);
                $table->string('page', 64)->default('home');
                $table->unsignedBigInteger('version')->default(1);
                $table->longText('payload')->nullable();
                $table->boolean('is_draft')->default(false);
                $table->timestamp('published_at')->nullable();
                $table->timestamps();

                $table->index(['app', 'page', 'created_at'], 'page_layout_revisions_lookup');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('page_layout_revisions');
        Schema::dropIfExists('page_layout_drafts');

        if (Schema::hasTable('page_blocks') && Schema::hasColumn('page_blocks', 'singleton_key')) {
            Schema::table('page_blocks', function (Blueprint $table): void {
                try {
                    $table->dropUnique('page_blocks_app_page_singleton_unique');
                } catch (Throwable) {
                    // Index may not exist when migration skipped it for existing duplicates.
                }
                $table->dropColumn('singleton_key');
            });
        }

        if (Schema::hasTable('page_blocks') && Schema::hasColumn('page_blocks', 'shared_content_id')) {
            Schema::table('page_blocks', function (Blueprint $table): void {
                try {
                    $table->dropForeign(['shared_content_id']);
                } catch (Throwable) {
                    // SQLite/non-MySQL tests may not create a named FK.
                }
                $table->dropColumn('shared_content_id');
            });
        }

        Schema::dropIfExists('page_block_shared_contents');
    }

    private function backfillSharedGenericBlocks(): void
    {
        if (
            ! Schema::hasTable('page_blocks')
            || ! Schema::hasTable('page_block_shared_contents')
            || ! Schema::hasColumn('page_blocks', 'shared_content_id')
        ) {
            return;
        }

        $rows = DB::table('page_blocks')
            ->where('content_mode', 'shared')
            ->whereNull('shared_content_id')
            ->whereIn('block_type', GenericBlockPresenter::TYPES)
            ->orderBy('id')
            ->get(['id', 'block_type', 'settings', 'created_at', 'updated_at']);

        foreach ($rows as $row) {
            $id = DB::table('page_block_shared_contents')->insertGetId([
                'uuid' => (string) Str::uuid(),
                'block_type' => (string) $row->block_type,
                'settings' => $row->settings,
                'created_at' => $row->created_at ?? now(),
                'updated_at' => $row->updated_at ?? now(),
            ]);

            DB::table('page_blocks')
                ->where('id', $row->id)
                ->update(['shared_content_id' => $id]);
        }
    }

    private function addSingletonKey(): void
    {
        if (! Schema::hasTable('page_blocks') || Schema::hasColumn('page_blocks', 'singleton_key')) {
            return;
        }

        $singletons = array_values(array_filter(
            array_keys(BlockTypeRegistry::all()),
            fn (string $type): bool => ! BlockTypeRegistry::allowsMultiple($type),
        ));

        if (DB::connection()->getDriverName() === 'mysql') {
            $quoted = implode(',', array_map(
                fn (string $type): string => DB::getPdo()->quote($type),
                $singletons,
            ));
            Schema::table('page_blocks', function (Blueprint $table) use ($quoted): void {
                $table->string('singleton_key', 64)
                    ->nullable()
                    ->storedAs("case when `block_type` in ({$quoted}) then `block_type` else null end")
                    ->after('shared_content_id');
            });

            if (! $this->hasSingletonDuplicates($singletons)) {
                Schema::table('page_blocks', function (Blueprint $table): void {
                    $table->unique(['app', 'page', 'singleton_key'], 'page_blocks_app_page_singleton_unique');
                });
            }

            return;
        }

        Schema::table('page_blocks', function (Blueprint $table): void {
            $table->string('singleton_key', 64)->nullable()->after('shared_content_id');
        });
    }

    /**
     * @param  list<string>  $singletons
     */
    private function hasSingletonDuplicates(array $singletons): bool
    {
        if ($singletons === []) {
            return false;
        }

        return DB::table('page_blocks')
            ->select('app', 'page', 'block_type')
            ->whereIn('block_type', $singletons)
            ->groupBy('app', 'page', 'block_type')
            ->havingRaw('count(*) > 1')
            ->exists();
    }
};
