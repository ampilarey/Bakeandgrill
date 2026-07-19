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
        Schema::create('item_packaging_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('name_dv', 80)->nullable();
            $table->decimal('fee', 8, 2)->default(0);
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['item_id', 'is_active', 'sort_order']);
        });

        Schema::table('items', function (Blueprint $table) {
            if (!Schema::hasColumn('items', 'packaging_fee_mode')) {
                $table->string('packaging_fee_mode', 20)->default('per_unit')->after('packaging_fee');
            }
        });

        Schema::table('order_items', function (Blueprint $table) {
            if (!Schema::hasColumn('order_items', 'packaging_option_id')) {
                $table->foreignId('packaging_option_id')
                    ->nullable()
                    ->after('notes')
                    ->constrained('item_packaging_options')
                    ->nullOnDelete();
            }
            if (!Schema::hasColumn('order_items', 'packaging_fee')) {
                $table->decimal('packaging_fee', 8, 2)->default(0)->after('packaging_option_id');
            }
            if (!Schema::hasColumn('order_items', 'packaging_fee_mode')) {
                $table->string('packaging_fee_mode', 20)->default('per_unit')->after('packaging_fee');
            }
            if (!Schema::hasColumn('order_items', 'packaging_option_name')) {
                $table->string('packaging_option_name', 80)->nullable()->after('packaging_fee_mode');
            }
        });

        $now = now();
        DB::table('site_settings')->updateOrInsert(
            ['key' => 'packaging_fee_taxable'],
            [
                'value' => '1',
                'type' => 'boolean',
                'group' => 'ordering',
                'label' => 'Packaging fee taxable',
                'description' => 'When on, GST applies to packaging fees (exclusive: add tax; inclusive: fee embeds tax).',
                'is_public' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            if (Schema::hasColumn('order_items', 'packaging_option_id')) {
                $table->dropConstrainedForeignId('packaging_option_id');
            }
            foreach (['packaging_fee', 'packaging_fee_mode', 'packaging_option_name'] as $col) {
                if (Schema::hasColumn('order_items', $col)) {
                    $table->dropColumn($col);
                }
            }
        });

        Schema::table('items', function (Blueprint $table) {
            if (Schema::hasColumn('items', 'packaging_fee_mode')) {
                $table->dropColumn('packaging_fee_mode');
            }
        });

        Schema::dropIfExists('item_packaging_options');

        DB::table('site_settings')->where('key', 'packaging_fee_taxable')->delete();
    }
};
